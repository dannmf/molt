//! Detecção de stack, artefatos regeneráveis e estado git de um projeto.
//!
//! `detect` e `git_info` são a lógica real, guiada por tabelas declarativas
//! (`KIND_RULES`/`ARTIFACT_RULES`) em vez de uma cadeia de `if`. Os três
//! traits abaixo (`KindDetector`/`ArtifactDetector`/`GitDetector`) são o
//! contrato já consumido por `scanner/mod.rs`; `Molt*Detector` são
//! implementações finas em cima de `detect`/`git_info` para não duplicar a
//! lógica em dois lugares.
//!
//! Tamanho não é medido aqui: todo `Artifact` sai com `bytes: 0` (ver
//! `docs/contract-requests.md` — o scanner precisa medir cada artefato
//! depois, hoje ele só soma o que já viesse preenchido).

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::model::{Artifact, ArtifactKind, GitInfo, ProjectKind};

/// Identifica as stacks presentes em um diretório de projeto.
pub trait KindDetector {
    fn detect(&self, project_root: &Path) -> Vec<ProjectKind>;
}

/// Encontra artefatos regeneráveis (node_modules, target/, Pods...) dentro de um projeto.
pub trait ArtifactDetector {
    fn detect(&self, project_root: &Path, kinds: &[ProjectKind]) -> Vec<Artifact>;
}

/// Lê o estado git de um projeto (branch, dirty, commits não enviados).
pub trait GitDetector {
    fn detect(&self, project_root: &Path) -> Result<Option<GitInfo>, AppError>;
}

/// Resultado de uma detecção completa (stack + artefatos) de um diretório.
/// Cada artefato é `(path, kind, regenerate_hint)` — sem tamanho, que é
/// responsabilidade do scanner.
pub struct DetectionResult {
    pub kinds: Vec<ProjectKind>,
    pub artifacts: Vec<(PathBuf, ArtifactKind, String)>,
}

/// Detecta stack e artefatos de `root` numa chamada só.
pub fn detect(root: &Path) -> DetectionResult {
    let kinds = detect_kinds(root);
    let artifacts = detect_artifacts(root, &kinds);
    DetectionResult { kinds, artifacts }
}

struct KindRule {
    kind: ProjectKind,
    matches: fn(&Path) -> bool,
}

const KIND_RULES: &[KindRule] = &[
    KindRule {
        kind: ProjectKind::Node,
        matches: |root| has_file(root, "package.json"),
    },
    KindRule {
        kind: ProjectKind::ReactNative,
        matches: |root| package_json_has_dependency(root, "react-native"),
    },
    KindRule {
        kind: ProjectKind::Expo,
        matches: |root| package_json_has_dependency(root, "expo"),
    },
    KindRule {
        kind: ProjectKind::Rust,
        matches: |root| has_file(root, "Cargo.toml"),
    },
    KindRule {
        kind: ProjectKind::Flutter,
        matches: |root| has_file(root, "pubspec.yaml") && pubspec_declares_flutter(root),
    },
    KindRule {
        kind: ProjectKind::Python,
        matches: |root| has_file(root, "pyproject.toml") || has_file(root, "requirements.txt"),
    },
    KindRule {
        kind: ProjectKind::Android,
        matches: |root| has_file(root, "build.gradle") || has_file(root, "build.gradle.kts"),
    },
    KindRule {
        kind: ProjectKind::Swift,
        matches: |root| has_file(root, "Package.swift") || has_dir_with_suffix(root, ".xcodeproj"),
    },
    KindRule {
        kind: ProjectKind::Go,
        matches: |root| has_file(root, "go.mod"),
    },
    KindRule {
        kind: ProjectKind::Java,
        matches: |root| has_file(root, "pom.xml"),
    },
];

/// Identifica as stacks de `root` aplicando `KIND_RULES` em ordem; um projeto
/// pode ter vários kinds (ex.: React Native é Node + ReactNative).
pub fn detect_kinds(root: &Path) -> Vec<ProjectKind> {
    KIND_RULES
        .iter()
        .filter(|rule| (rule.matches)(root))
        .map(|rule| rule.kind)
        .collect()
}

struct ArtifactRule {
    kind: ProjectKind,
    relative_path: &'static str,
    artifact_kind: fn() -> ArtifactKind,
    hint: &'static str,
}

const ARTIFACT_RULES: &[ArtifactRule] = &[
    ArtifactRule {
        kind: ProjectKind::Node,
        relative_path: "node_modules",
        artifact_kind: || ArtifactKind::NodeModules,
        // Hint real depende do lockfile presente; sobrescrito depois.
        hint: "npm install",
    },
    ArtifactRule {
        kind: ProjectKind::Node,
        relative_path: ".next",
        artifact_kind: || ArtifactKind::NextBuild,
        hint: "next build",
    },
    ArtifactRule {
        kind: ProjectKind::Node,
        relative_path: ".turbo",
        artifact_kind: || ArtifactKind::Other("turbo-cache".to_string()),
        hint: "turbo run build",
    },
    ArtifactRule {
        kind: ProjectKind::Node,
        relative_path: "dist",
        artifact_kind: || ArtifactKind::Dist,
        hint: "npm run build",
    },
    ArtifactRule {
        kind: ProjectKind::Node,
        relative_path: ".parcel-cache",
        artifact_kind: || ArtifactKind::Other("parcel-cache".to_string()),
        hint: "parcel build",
    },
    ArtifactRule {
        kind: ProjectKind::ReactNative,
        relative_path: "ios/Pods",
        artifact_kind: || ArtifactKind::Pods,
        hint: "cd ios && pod install",
    },
    ArtifactRule {
        kind: ProjectKind::ReactNative,
        relative_path: "ios/build",
        artifact_kind: || ArtifactKind::XcodeBuild,
        hint: "cd ios && xcodebuild clean",
    },
    ArtifactRule {
        kind: ProjectKind::ReactNative,
        relative_path: "android/build",
        artifact_kind: || ArtifactKind::AndroidBuild,
        hint: "cd android && ./gradlew clean",
    },
    ArtifactRule {
        kind: ProjectKind::ReactNative,
        relative_path: "android/app/build",
        artifact_kind: || ArtifactKind::AndroidBuild,
        hint: "cd android && ./gradlew clean",
    },
    ArtifactRule {
        kind: ProjectKind::ReactNative,
        relative_path: "android/.gradle",
        artifact_kind: || ArtifactKind::GradleProject,
        hint: "cd android && ./gradlew --stop",
    },
    ArtifactRule {
        kind: ProjectKind::Expo,
        relative_path: ".expo",
        artifact_kind: || ArtifactKind::Other("expo-cache".to_string()),
        hint: "expo start -c",
    },
    ArtifactRule {
        kind: ProjectKind::Rust,
        relative_path: "target",
        artifact_kind: || ArtifactKind::RustTarget,
        hint: "cargo build",
    },
    ArtifactRule {
        kind: ProjectKind::Flutter,
        relative_path: "build",
        artifact_kind: || ArtifactKind::FlutterBuild,
        hint: "flutter pub get",
    },
    ArtifactRule {
        kind: ProjectKind::Flutter,
        relative_path: ".dart_tool",
        artifact_kind: || ArtifactKind::DartTool,
        hint: "flutter pub get",
    },
    ArtifactRule {
        kind: ProjectKind::Flutter,
        relative_path: "ios/Pods",
        artifact_kind: || ArtifactKind::Pods,
        hint: "cd ios && pod install",
    },
    ArtifactRule {
        kind: ProjectKind::Android,
        relative_path: "build",
        artifact_kind: || ArtifactKind::AndroidBuild,
        hint: "./gradlew clean",
    },
    ArtifactRule {
        kind: ProjectKind::Android,
        relative_path: ".gradle",
        artifact_kind: || ArtifactKind::GradleProject,
        hint: "./gradlew --stop",
    },
    ArtifactRule {
        kind: ProjectKind::Swift,
        relative_path: ".build",
        artifact_kind: || ArtifactKind::Other("spm-build".to_string()),
        hint: "swift package clean",
    },
    ArtifactRule {
        kind: ProjectKind::Java,
        relative_path: "target",
        artifact_kind: || ArtifactKind::Other("maven-target".to_string()),
        hint: "mvn clean",
    },
];

/// Encontra os artefatos regeneráveis de `root` para os `kinds` já detectados.
/// Python é tratado fora da tabela porque suas regras (venv só com
/// `pyvenv.cfg`, `__pycache__` recursivo) não são um simples "existe esse
/// caminho?".
pub fn detect_artifacts(
    root: &Path,
    kinds: &[ProjectKind],
) -> Vec<(PathBuf, ArtifactKind, String)> {
    let mut artifacts: Vec<(PathBuf, ArtifactKind, String)> = ARTIFACT_RULES
        .iter()
        .filter(|rule| kinds.contains(&rule.kind))
        .filter_map(|rule| {
            let path = root.join(rule.relative_path);
            path.exists()
                .then(|| (path, (rule.artifact_kind)(), rule.hint.to_string()))
        })
        .collect();

    if kinds.contains(&ProjectKind::Node) {
        if let Some(entry) = artifacts
            .iter_mut()
            .find(|(_, kind, _)| *kind == ArtifactKind::NodeModules)
        {
            entry.2 = node_install_hint(root);
        }
    }

    if kinds.contains(&ProjectKind::Python) {
        artifacts.extend(python_artifacts(root));
    }

    artifacts
}

fn has_file(root: &Path, name: &str) -> bool {
    root.join(name).is_file()
}

fn has_dir_with_suffix(root: &Path, suffix: &str) -> bool {
    let Ok(entries) = fs::read_dir(root) else {
        return false;
    };
    entries.filter_map(Result::ok).any(|entry| {
        entry.file_type().map(|t| t.is_dir()).unwrap_or(false)
            && entry.file_name().to_string_lossy().ends_with(suffix)
    })
}

/// Verdadeiro se `package.json` declara `dep` em `dependencies` ou `devDependencies`.
fn package_json_has_dependency(root: &Path, dep: &str) -> bool {
    let Ok(content) = fs::read_to_string(root.join("package.json")) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
        return false;
    };
    ["dependencies", "devDependencies"]
        .iter()
        .any(|key| value.get(key).and_then(|deps| deps.get(dep)).is_some())
}

/// Heurística: `pubspec.yaml` de um pacote Dart puro não declara uma
/// dependência `flutter` como SDK; um app/pacote Flutter sempre tem a linha
/// `sdk: flutter` em algum lugar das dependências (sem parser de YAML, só
/// uma busca de substring — mesma abordagem usada em `scanner/workspace.rs`).
fn pubspec_declares_flutter(root: &Path) -> bool {
    fs::read_to_string(root.join("pubspec.yaml"))
        .map(|content| content.contains("sdk: flutter"))
        .unwrap_or(false)
}

fn node_install_hint(root: &Path) -> String {
    if root.join("pnpm-lock.yaml").is_file() {
        "pnpm install".to_string()
    } else if root.join("yarn.lock").is_file() {
        "yarn install".to_string()
    } else {
        "npm install".to_string()
    }
}

/// Artefatos Python: venv só conta se tiver `pyvenv.cfg` dentro (evita
/// confundir uma pasta `venv`/`.venv` qualquer com um virtualenv de verdade);
/// `__pycache__` é procurado recursivamente, sem seguir symlink, e cada
/// ocorrência vira seu próprio artefato (todos com o mesmo `ArtifactKind`,
/// então a UI já os agrupa por tipo — "agregado" aqui é sobre a busca
/// recursiva, não sobre virar uma única entrada por projeto).
fn python_artifacts(root: &Path) -> Vec<(PathBuf, ArtifactKind, String)> {
    let mut artifacts = Vec::new();

    for name in ["venv", ".venv"] {
        let dir = root.join(name);
        if dir.join("pyvenv.cfg").is_file() {
            artifacts.push((
                dir,
                ArtifactKind::PythonVenv,
                "python -m venv .venv".to_string(),
            ));
        }
    }

    for name in [".pytest_cache", ".mypy_cache"] {
        let dir = root.join(name);
        if dir.is_dir() {
            artifacts.push((
                dir,
                ArtifactKind::PythonCache,
                "regenerado automaticamente".to_string(),
            ));
        }
    }

    for dir in find_pycache_dirs(root) {
        artifacts.push((
            dir,
            ArtifactKind::PythonCache,
            "regenerado automaticamente".to_string(),
        ));
    }

    artifacts
}

fn find_pycache_dirs(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    walk_for_pycache(root, &mut found);
    found
}

fn walk_for_pycache(dir: &Path, found: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() || !file_type.is_dir() {
            continue;
        }
        let path = entry.path();
        if entry.file_name() == "__pycache__" {
            found.push(path);
            continue;
        }
        walk_for_pycache(&path, found);
    }
}

/// Lê o estado git de `path` via `git2`. `None` se `path` não é um repositório.
pub fn git_info(path: &Path) -> Option<GitInfo> {
    let repo = git2::Repository::open(path).ok()?;

    let has_remote = repo.remotes().map(|r| !r.is_empty()).unwrap_or(false);
    let head = repo.head().ok();
    let branch = head
        .as_ref()
        .and_then(|h| h.shorthand().ok())
        .map(str::to_string);
    let last_commit_at = head
        .as_ref()
        .and_then(|h| h.peel_to_commit().ok())
        .map(|commit| commit.time().seconds());

    let dirty = {
        let mut opts = git2::StatusOptions::new();
        opts.include_untracked(true);
        repo.statuses(Some(&mut opts))
            .map(|statuses| !statuses.is_empty())
            .unwrap_or(false)
    };

    let unpushed_commits = count_unpushed_commits(&repo).unwrap_or(0);

    Some(GitInfo {
        branch,
        last_commit_at,
        dirty,
        unpushed_commits,
        has_remote,
    })
}

/// Commits no HEAD local que não estão no upstream configurado. Sem upstream
/// (branch nunca publicada), devolve 0 — não é um erro, é o estado normal de
/// uma branch local nova.
fn count_unpushed_commits(repo: &git2::Repository) -> Result<u32, git2::Error> {
    let head = repo.head()?;
    let local_oid = head
        .target()
        .ok_or_else(|| git2::Error::from_str("HEAD sem commit"))?;
    let branch_name = head.shorthand()?;

    let local_branch = repo.find_branch(branch_name, git2::BranchType::Local)?;
    let upstream = local_branch.upstream()?;
    let upstream_oid = upstream
        .get()
        .target()
        .ok_or_else(|| git2::Error::from_str("upstream sem commit"))?;

    let (ahead, _behind) = repo.graph_ahead_behind(local_oid, upstream_oid)?;
    Ok(ahead as u32)
}

/// Implementação real de `KindDetector`, em cima de `detect_kinds`.
pub struct MoltKindDetector;

impl KindDetector for MoltKindDetector {
    fn detect(&self, project_root: &Path) -> Vec<ProjectKind> {
        detect_kinds(project_root)
    }
}

/// Implementação real de `ArtifactDetector`, em cima de `detect_artifacts`.
pub struct MoltArtifactDetector;

impl ArtifactDetector for MoltArtifactDetector {
    fn detect(&self, project_root: &Path, kinds: &[ProjectKind]) -> Vec<Artifact> {
        detect_artifacts(project_root, kinds)
            .into_iter()
            .map(|(path, kind, regenerate_hint)| Artifact {
                path,
                kind,
                bytes: 0,
                regenerate_hint,
            })
            .collect()
    }
}

/// Implementação real de `GitDetector`, em cima de `git_info`.
pub struct MoltGitDetector;

impl GitDetector for MoltGitDetector {
    fn detect(&self, project_root: &Path) -> Result<Option<GitInfo>, AppError> {
        Ok(git_info(project_root))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    use tempfile::tempdir;

    fn write(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn mkdir(path: &Path) {
        fs::create_dir_all(path).unwrap();
    }

    #[test]
    fn detects_node_project_and_its_artifacts() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(&root.join("package.json"), r#"{"name":"app"}"#);
        write(&root.join("pnpm-lock.yaml"), "");
        mkdir(&root.join("node_modules"));
        mkdir(&root.join(".next"));
        mkdir(&root.join("dist"));

        let result = detect(&root);
        assert_eq!(result.kinds, vec![ProjectKind::Node]);

        let node_modules = result
            .artifacts
            .iter()
            .find(|(_, kind, _)| *kind == ArtifactKind::NodeModules)
            .unwrap();
        assert_eq!(node_modules.2, "pnpm install");

        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::NextBuild));
        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::Dist));
    }

    #[test]
    fn react_native_project_is_node_and_react_native() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(
            &root.join("package.json"),
            r#"{"name":"app","dependencies":{"react-native":"0.74.0"}}"#,
        );
        mkdir(&root.join("ios/Pods"));
        mkdir(&root.join("android/build"));
        mkdir(&root.join("android/.gradle"));

        let result = detect(&root);
        assert_eq!(
            result.kinds,
            vec![ProjectKind::Node, ProjectKind::ReactNative]
        );
        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::Pods));
        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::AndroidBuild));
        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::GradleProject));
    }

    #[test]
    fn expo_project_is_node_and_expo() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(
            &root.join("package.json"),
            r#"{"name":"app","dependencies":{"expo":"~51.0.0"}}"#,
        );
        mkdir(&root.join(".expo"));

        let result = detect(&root);
        assert_eq!(result.kinds, vec![ProjectKind::Node, ProjectKind::Expo]);
        assert!(result
            .artifacts
            .iter()
            .any(|(path, _, _)| path.ends_with(".expo")));
    }

    #[test]
    fn detects_rust_project_and_target() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(&root.join("Cargo.toml"), "[package]\nname = \"app\"\n");
        mkdir(&root.join("target"));

        let result = detect(&root);
        assert_eq!(result.kinds, vec![ProjectKind::Rust]);
        assert_eq!(result.artifacts.len(), 1);
        assert_eq!(result.artifacts[0].1, ArtifactKind::RustTarget);
        assert_eq!(result.artifacts[0].2, "cargo build");
    }

    #[test]
    fn detects_flutter_project_and_its_artifacts() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(
            &root.join("pubspec.yaml"),
            "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n",
        );
        mkdir(&root.join("build"));
        mkdir(&root.join(".dart_tool"));
        mkdir(&root.join("ios/Pods"));

        let result = detect(&root);
        assert_eq!(result.kinds, vec![ProjectKind::Flutter]);
        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::FlutterBuild));
        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::DartTool));
        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::Pods));
    }

    #[test]
    fn pure_dart_package_is_not_flutter() {
        let home = tempdir().unwrap();
        let root = home.path().join("pkg");
        write(&root.join("pubspec.yaml"), "name: pkg\nversion: 0.1.0\n");

        let result = detect(&root);
        assert!(!result.kinds.contains(&ProjectKind::Flutter));
    }

    #[test]
    fn detects_python_project_with_aggregated_pycache() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(&root.join("requirements.txt"), "requests==2.31.0\n");
        mkdir(&root.join("__pycache__"));
        mkdir(&root.join("pkg/__pycache__"));
        mkdir(&root.join(".pytest_cache"));
        mkdir(&root.join(".mypy_cache"));
        mkdir(&root.join(".venv"));
        write(&root.join(".venv/pyvenv.cfg"), "home = /usr/bin\n");

        let result = detect(&root);
        assert_eq!(result.kinds, vec![ProjectKind::Python]);

        let pycache_count = result
            .artifacts
            .iter()
            .filter(|(path, kind, _)| {
                *kind == ArtifactKind::PythonCache && path.ends_with("__pycache__")
            })
            .count();
        assert_eq!(pycache_count, 2);
        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::PythonVenv));
    }

    #[test]
    fn venv_without_pyvenv_cfg_is_ignored() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(&root.join("requirements.txt"), "");
        mkdir(&root.join("venv"));
        write(
            &root.join("venv/some_file.txt"),
            "não é um virtualenv de verdade",
        );

        let result = detect(&root);
        assert!(!result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::PythonVenv));
    }

    #[test]
    fn detects_pure_android_project() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(&root.join("build.gradle"), "");
        mkdir(&root.join("build"));
        mkdir(&root.join(".gradle"));

        let result = detect(&root);
        assert_eq!(result.kinds, vec![ProjectKind::Android]);
        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::AndroidBuild));
        assert!(result
            .artifacts
            .iter()
            .any(|(_, kind, _)| *kind == ArtifactKind::GradleProject));
    }

    #[test]
    fn detects_swift_xcode_project() {
        let home = tempdir().unwrap();
        let root = home.path().join("App");
        mkdir(&root.join("App.xcodeproj"));
        mkdir(&root.join(".build"));

        let result = detect(&root);
        assert_eq!(result.kinds, vec![ProjectKind::Swift]);
        assert_eq!(result.artifacts.len(), 1);
        assert!(matches!(&result.artifacts[0].1, ArtifactKind::Other(s) if s == "spm-build"));
    }

    #[test]
    fn detects_go_project() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(&root.join("go.mod"), "module app\n\ngo 1.22\n");

        let result = detect(&root);
        assert_eq!(result.kinds, vec![ProjectKind::Go]);
    }

    #[test]
    fn detects_java_project_and_maven_target() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(&root.join("pom.xml"), "<project></project>");
        mkdir(&root.join("target"));

        let result = detect(&root);
        assert_eq!(result.kinds, vec![ProjectKind::Java]);
        assert!(matches!(&result.artifacts[0].1, ArtifactKind::Other(s) if s == "maven-target"));
    }

    #[test]
    fn pycache_walk_does_not_follow_symlinks() {
        let home = tempdir().unwrap();
        let root = home.path().join("app");
        write(&root.join("requirements.txt"), "");
        let outside = home.path().join("outside");
        mkdir(&outside.join("__pycache__"));
        symlink(&outside, root.join("link")).unwrap();

        let result = detect(&root);
        assert!(result.artifacts.is_empty());
    }

    fn init_repo(root: &Path) -> git2::Repository {
        let repo = git2::Repository::init(root).unwrap();
        write(&root.join("README.md"), "# fixture\n");
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("README.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let signature = git2::Signature::now("Molt Fixture", "fixture@molt.test").unwrap();
        {
            let tree = repo.find_tree(tree_id).unwrap();
            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                "initial commit",
                &tree,
                &[],
            )
            .unwrap();
        }
        repo
    }

    #[test]
    fn dirty_repo_is_reported_as_dirty() {
        let home = tempdir().unwrap();
        let root = home.path().join("repo");
        let _repo = init_repo(&root);
        write(&root.join("README.md"), "# fixture\n\nmudança local\n");

        let info = git_info(&root).unwrap();
        assert!(info.dirty);
        assert_eq!(info.unpushed_commits, 0);
        assert!(!info.has_remote);
        assert!(info.branch.is_some());
        assert!(info.last_commit_at.is_some());
    }

    #[test]
    fn repo_ahead_of_remote_reports_unpushed_commits() {
        let home = tempdir().unwrap();
        let remote_root = home.path().join("remote.git");
        git2::Repository::init_bare(&remote_root).unwrap();

        let root = home.path().join("repo");
        let repo = init_repo(&root);
        let branch_name = repo.head().unwrap().shorthand().unwrap().to_string();

        // Configura o repo "remote" (bare) como upstream, apontando pro
        // mesmo commit do primeiro commit local, sem precisar de uma rede
        // de verdade: a ref remota é criada direto no disco.
        let first_commit_oid = repo.head().unwrap().target().unwrap();
        {
            let mut remote = repo
                .remote("origin", remote_root.to_str().unwrap())
                .unwrap();
            remote
                .push(
                    &[format!("refs/heads/{branch_name}:refs/heads/{branch_name}")],
                    None,
                )
                .unwrap();
        }
        repo.reference(
            &format!("refs/remotes/origin/{branch_name}"),
            first_commit_oid,
            true,
            "setup do teste",
        )
        .unwrap();
        let mut config = repo.config().unwrap();
        config
            .set_str(&format!("branch.{branch_name}.remote"), "origin")
            .unwrap();
        config
            .set_str(
                &format!("branch.{branch_name}.merge"),
                &format!("refs/heads/{branch_name}"),
            )
            .unwrap();

        // Agora avança o HEAD local sem publicar: 2 commits à frente do remote.
        for i in 0..2 {
            write(&root.join(format!("file-{i}.txt")), "conteudo");
            let mut index = repo.index().unwrap();
            index.add_path(Path::new(&format!("file-{i}.txt"))).unwrap();
            index.write().unwrap();
            let tree_id = index.write_tree().unwrap();
            let tree = repo.find_tree(tree_id).unwrap();
            let signature = git2::Signature::now("Molt Fixture", "fixture@molt.test").unwrap();
            let parent = repo.head().unwrap().peel_to_commit().unwrap();
            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                "mais um commit",
                &tree,
                &[&parent],
            )
            .unwrap();
        }

        let info = git_info(&root).unwrap();
        assert_eq!(info.unpushed_commits, 2);
        assert!(info.has_remote);
    }

    #[test]
    fn non_repo_has_no_git_info() {
        let home = tempdir().unwrap();
        assert!(git_info(home.path()).is_none());
    }
}
