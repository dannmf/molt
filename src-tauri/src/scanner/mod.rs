//! Varredura de disco: encontra projetos sob as raízes pedidas e mede seu tamanho.
//!
//! Regras de medição (ver docs/architecture.md):
//! - Tamanho = blocos alocados (`st_blocks * 512`), nunca `st_size`.
//! - Hardlinks são deduplicados por `(dev, ino)` dentro de uma mesma varredura.
//! - Symlinks nunca são seguidos.
//!
//! Fases: (1) `jwalk`, com paralelismo, descobre as raízes de projeto (para no
//! primeiro marcador, exceto para resolver membros de monorepo — ver
//! `workspace.rs`); (2) `rayon` mede tamanho e chama os detectores injetados
//! em paralelo, um projeto por vez.

mod markers;
mod size;
mod workspace;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};

use jwalk::WalkDir;
use rayon::prelude::*;

use crate::detectors::{ArtifactDetector, GitDetector, KindDetector};
use crate::error::AppError;
use crate::model::{Project, ScanProgress, ScanRequest};

use markers::DEFAULT_IGNORE;

/// Detectores injetados pela camada `detectors`. O scanner não sabe identificar
/// stack, artefatos ou estado git: só orquestra a chamada para cada projeto
/// encontrado. `Sync` é exigido porque a montagem dos projetos roda em paralelo
/// (via rayon) sobre a mesma referência.
pub struct Detectors<'a> {
    pub kind: &'a (dyn KindDetector + Sync),
    pub artifact: &'a (dyn ArtifactDetector + Sync),
    pub git: &'a (dyn GitDetector + Sync),
}

/// Implementado pelo scanner real; permite trocar a implementação em testes.
pub trait Scanner {
    fn scan(
        &self,
        request: &ScanRequest,
        detectors: &Detectors,
        on_progress: &mut dyn FnMut(ScanProgress),
    ) -> Result<Vec<Project>, AppError>;
}

/// Varredura real, baseada em `jwalk` + `rayon`.
pub struct JwalkScanner;

impl Scanner for JwalkScanner {
    fn scan(
        &self,
        request: &ScanRequest,
        detectors: &Detectors,
        on_progress: &mut dyn FnMut(ScanProgress),
    ) -> Result<Vec<Project>, AppError> {
        scan_impl(request, detectors, on_progress)
    }
}

fn scan_impl(
    request: &ScanRequest,
    detectors: &Detectors,
    on_progress: &mut dyn FnMut(ScanProgress),
) -> Result<Vec<Project>, AppError> {
    let ignore_set: Arc<std::collections::HashSet<String>> = Arc::new(
        DEFAULT_IGNORE
            .iter()
            .map(|s| s.to_string())
            .chain(request.ignore.iter().cloned())
            .collect(),
    );
    let candidates: Arc<Mutex<Vec<PathBuf>>> = Arc::new(Mutex::new(Vec::new()));

    let mut scanned_dirs = 0u64;
    let mut last_emit = Instant::now();

    for root in &request.roots {
        let candidates_for_walker = Arc::clone(&candidates);
        let ignore_set = Arc::clone(&ignore_set);

        let walker = WalkDir::new(root)
            .follow_links(false)
            .skip_hidden(false)
            .max_depth(request.max_depth as usize)
            .process_read_dir(move |_depth, dir_path, _read_dir_state, children| {
                // Se este diretório já tem um marcador de projeto entre seus
                // filhos diretos, registra-o e para de descer (exceto a
                // resolução de monorepo, que roda depois, direto no disco).
                if markers::children_have_marker(children) {
                    candidates_for_walker
                        .lock()
                        .unwrap()
                        .push(dir_path.to_path_buf());
                    children.clear();
                    return;
                }
                // Senão, poda os filhos que são pontos de parada default
                // (.Trash, Library, .git, node_modules) ou do `ignore` do
                // request: continuamos sabendo que existem, só não descemos.
                for child in children.iter_mut().flatten() {
                    if child.file_type().is_dir() {
                        let name = child.file_name().to_string_lossy();
                        if ignore_set.contains(name.as_ref()) {
                            child.read_children = None;
                        }
                    }
                }
            });

        for entry in walker {
            let entry = match entry {
                Ok(entry) => entry,
                // Erro de permissão (ou similar) num diretório: não derruba a
                // varredura, só pula esta entrada.
                Err(_) => continue,
            };
            if entry.file_type().is_dir() {
                scanned_dirs += 1;
            }
            if last_emit.elapsed() >= Duration::from_millis(100) {
                let projects_found = candidates.lock().unwrap().len() as u64;
                on_progress(ScanProgress {
                    scanned_dirs,
                    projects_found,
                    current_path: entry.path().to_string_lossy().into_owned(),
                });
                last_emit = Instant::now();
            }
        }
    }

    let roots_found = {
        let mut guard = candidates.lock().unwrap();
        std::mem::take(&mut *guard)
    };

    let mut project_paths: Vec<PathBuf> = Vec::new();
    for root in &roots_found {
        project_paths.push(root.clone());
        project_paths.extend(workspace::monorepo_members(root));
    }
    project_paths.sort();
    project_paths.dedup();

    let dedup = size::SharedDedup::new();
    let mut projects: Vec<Project> = project_paths
        .par_iter()
        .map(|path| build_project(path, &dedup, detectors))
        .collect();
    projects.sort_by(|a, b| a.path.cmp(&b.path));

    on_progress(ScanProgress {
        scanned_dirs,
        projects_found: projects.len() as u64,
        current_path: String::new(),
    });

    Ok(projects)
}

fn build_project(path: &Path, dedup: &size::SharedDedup, detectors: &Detectors) -> Project {
    let kinds = detectors.kind.detect(path);
    // `detectors.artifact` nunca mede tamanho (ver detectors::mod.rs); cada
    // artefato é medido aqui com um dedup próprio, ANTES do dedup compartilhado
    // da varredura ver seus inodes — assim o total_bytes abaixo (que usa o
    // dedup compartilhado) ainda conta esses blocos por completo, em vez de
    // achá-los já "vistos" e somar zero.
    let mut artifacts = detectors.artifact.detect(path, &kinds);
    for artifact in &mut artifacts {
        artifact.bytes = size::SharedDedup::new()
            .disk_usage_bytes(&artifact.path)
            .unwrap_or(0);
    }
    let reclaimable_bytes = artifacts.iter().map(|a| a.bytes).sum();
    let total_bytes = dedup.disk_usage_bytes(path).unwrap_or(0);
    // Detecção de git pode falhar (ex.: repo corrompido); isso não deve abortar
    // a varredura, só deixar o projeto sem informação de git.
    let git = detectors.git.detect(path).unwrap_or(None);
    // Aproximação: mtime do diretório raiz do projeto, não da árvore inteira
    // (um segundo walk só para achar o mtime mais recente não compensa o custo
    // aqui; ver docs/contract-requests.md).
    let last_modified_at = fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);

    Project {
        id: project_id(path),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string_lossy().into_owned()),
        path: path.to_path_buf(),
        kinds,
        total_bytes,
        reclaimable_bytes,
        artifacts,
        last_modified_at,
        git,
    }
}

/// Hash estável do path, usado como `Project::id`.
fn project_id(path: &Path) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Artifact, GitInfo, ProjectKind};
    use std::os::unix::fs::PermissionsExt;
    use tempfile::tempdir;

    struct NullKindDetector;
    impl KindDetector for NullKindDetector {
        fn detect(&self, _project_root: &Path) -> Vec<ProjectKind> {
            Vec::new()
        }
    }

    struct NullArtifactDetector;
    impl ArtifactDetector for NullArtifactDetector {
        fn detect(&self, _project_root: &Path, _kinds: &[ProjectKind]) -> Vec<Artifact> {
            Vec::new()
        }
    }

    struct NullGitDetector;
    impl GitDetector for NullGitDetector {
        fn detect(&self, _project_root: &Path) -> Result<Option<GitInfo>, AppError> {
            Ok(None)
        }
    }

    fn null_detectors() -> Detectors<'static> {
        Detectors {
            kind: &NullKindDetector,
            artifact: &NullArtifactDetector,
            git: &NullGitDetector,
        }
    }

    fn request(roots: Vec<PathBuf>, max_depth: u32) -> ScanRequest {
        ScanRequest {
            roots,
            max_depth,
            ignore: Vec::new(),
        }
    }

    fn scan(req: &ScanRequest) -> Vec<Project> {
        JwalkScanner
            .scan(req, &null_detectors(), &mut |_| {})
            .unwrap()
    }

    #[test]
    fn finds_a_simple_project() {
        let home = tempdir().unwrap();
        let fixture = crate::testkit::fixture_node_project(home.path(), "app", 1).unwrap();

        let projects = scan(&request(vec![home.path().to_path_buf()], 10));

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].path, fixture.root);
        assert!(projects[0].total_bytes > 0);
    }

    #[test]
    fn registers_monorepo_root_and_members() {
        let home = tempdir().unwrap();
        let root = home.path().join("monorepo");
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("package.json"),
            r#"{"name":"root","workspaces":["packages/*"]}"#,
        )
        .unwrap();
        fs::create_dir_all(root.join("packages/a")).unwrap();
        fs::write(root.join("packages/a/package.json"), "{}").unwrap();
        fs::create_dir_all(root.join("packages/b")).unwrap();
        fs::write(root.join("packages/b/package.json"), "{}").unwrap();

        let mut projects = scan(&request(vec![home.path().to_path_buf()], 10));
        projects.sort_by(|a, b| a.path.cmp(&b.path));

        let paths: Vec<PathBuf> = projects.into_iter().map(|p| p.path).collect();
        assert_eq!(
            paths,
            vec![
                root.clone(),
                root.join("packages/a"),
                root.join("packages/b"),
            ]
        );
    }

    #[test]
    fn symlink_loop_does_not_hang() {
        let home = tempdir().unwrap();
        crate::testkit::fixture_node_project(home.path(), "app", 1).unwrap();
        crate::testkit::fixture_symlink_loop(home.path(), "looped").unwrap();

        // Se o scanner seguisse o symlink em loop, isso nunca retornaria.
        let projects = scan(&request(vec![home.path().to_path_buf()], 10));
        assert_eq!(projects.len(), 1);
    }

    #[test]
    fn hardlinked_siblings_are_counted_once() {
        let home = tempdir().unwrap();
        crate::testkit::fixture_hardlinked_store(home.path()).unwrap();
        // A fixture só cria o conteúdo hardlinkado dentro de node_modules; o
        // marcador de projeto em si precisa ser escrito à parte.
        for name in ["project-a", "project-b"] {
            fs::write(home.path().join(name).join("package.json"), "{}").unwrap();
        }

        let projects = scan(&request(vec![home.path().to_path_buf()], 10));
        assert_eq!(projects.len(), 2);

        let total: u64 = projects.iter().map(|p| p.total_bytes).sum();
        // Medindo os dois projetos de forma independente (sem dedup compartilhado
        // entre eles), o conteúdo hardlinkado seria contado duas vezes; a soma do
        // scanner, que compartilha o dedup entre projetos, deve ser menor.
        let independent_total: u64 = ["project-a", "project-b"]
            .iter()
            .map(|name| crate::testkit::disk_usage_bytes(&home.path().join(name)).unwrap())
            .sum();
        assert!(total < independent_total);
    }

    #[test]
    fn unreadable_directory_is_skipped_not_fatal() {
        let home = tempdir().unwrap();
        crate::testkit::fixture_node_project(home.path(), "app", 1).unwrap();
        let locked = home.path().join("locked");
        fs::create_dir_all(&locked).unwrap();

        let original = fs::metadata(&locked).unwrap().permissions();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

        let result = JwalkScanner.scan(
            &request(vec![home.path().to_path_buf()], 10),
            &null_detectors(),
            &mut |_| {},
        );

        fs::set_permissions(&locked, original).unwrap();

        let projects = result.unwrap();
        assert_eq!(projects.len(), 1);
    }

    #[test]
    fn respects_max_depth() {
        let home = tempdir().unwrap();
        let deep = home.path().join("a/b/c/deep-project");
        fs::create_dir_all(&deep).unwrap();
        fs::write(deep.join("package.json"), "{}").unwrap();

        // Profundidade insuficiente para alcançar o projeto.
        let shallow = scan(&request(vec![home.path().to_path_buf()], 2));
        assert_eq!(shallow.len(), 0);

        let enough = scan(&request(vec![home.path().to_path_buf()], 10));
        assert_eq!(enough.len(), 1);
    }

    #[test]
    fn progress_callback_reports_final_state() {
        let home = tempdir().unwrap();
        crate::testkit::fixture_node_project(home.path(), "app", 1).unwrap();

        let mut last: Option<ScanProgress> = None;
        JwalkScanner
            .scan(
                &request(vec![home.path().to_path_buf()], 10),
                &null_detectors(),
                &mut |progress| last = Some(progress),
            )
            .unwrap();

        let last = last.expect("deveria emitir ao menos um progresso");
        assert_eq!(last.projects_found, 1);
    }

    #[test]
    fn reclaimable_bytes_reflects_real_artifact_size() {
        use crate::detectors::{MoltArtifactDetector, MoltGitDetector, MoltKindDetector};

        let home = tempdir().unwrap();
        let fixture = crate::testkit::fixture_node_project(home.path(), "app", 1).unwrap();

        let detectors = Detectors {
            kind: &MoltKindDetector,
            artifact: &MoltArtifactDetector,
            git: &MoltGitDetector,
        };
        let projects = JwalkScanner
            .scan(
                &request(vec![home.path().to_path_buf()], 10),
                &detectors,
                &mut |_| {},
            )
            .unwrap();

        assert_eq!(projects.len(), 1);
        let project = &projects[0];
        assert_eq!(project.artifacts.len(), 1);
        assert_eq!(project.artifacts[0].path, fixture.artifacts[0].path);
        assert!(project.artifacts[0].bytes > 0);
        assert_eq!(
            project.reclaimable_bytes,
            project.artifacts.iter().map(|a| a.bytes).sum::<u64>()
        );
        assert!(project.reclaimable_bytes <= project.total_bytes);
    }

    #[test]
    fn fixture_flutter_project_is_detected_as_flutter_with_artifacts() {
        use crate::detectors::{MoltArtifactDetector, MoltGitDetector, MoltKindDetector};
        use crate::model::ProjectKind;

        let home = tempdir().unwrap();
        crate::testkit::fixture_flutter_project(home.path(), "app", 1).unwrap();

        let detectors = Detectors {
            kind: &MoltKindDetector,
            artifact: &MoltArtifactDetector,
            git: &MoltGitDetector,
        };
        let projects = JwalkScanner
            .scan(
                &request(vec![home.path().to_path_buf()], 10),
                &detectors,
                &mut |_| {},
            )
            .unwrap();

        assert_eq!(projects.len(), 1);
        let project = &projects[0];
        assert!(project.kinds.contains(&ProjectKind::Flutter));
        assert!(!project.artifacts.is_empty());
        assert!(project.reclaimable_bytes > 0);
    }

    #[test]
    #[ignore = "benchmark: roda só sob demanda (cargo test -- --ignored)"]
    fn bench_fifty_projects() {
        let home = tempdir().unwrap();
        for i in 0..50 {
            crate::testkit::fixture_node_project(home.path(), &format!("project-{i}"), 1).unwrap();
        }

        let start = Instant::now();
        let projects = scan(&request(vec![home.path().to_path_buf()], 10));
        let elapsed = start.elapsed();

        assert_eq!(projects.len(), 50);
        println!("varreu 50 projetos em {elapsed:?}");
        assert!(elapsed < Duration::from_secs(10));
    }
}
