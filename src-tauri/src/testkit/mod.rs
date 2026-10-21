//! Fixtures de um HOME falso em tempdir, usadas pelos testes do scanner/detectors/caches.
//!
//! Compilado só em `cfg(test)` ou com a feature `testkit`. Nunca toca no HOME real:
//! toda função recebe `home: &Path` e escreve apenas dentro dele.
//!
//! Arquivos grandes são esparsos (`File::set_len`, sem escrever dados) para ficarem
//! rápidos em qualquer filesystem. Por isso os testes devem comparar contra o tamanho
//! em disco que a própria fixture mede e devolve (`bytes_on_disk`), nunca contra um
//! valor fixo: a alocação de blocos de um arquivo esparso varia por filesystem/SO.

use std::fs::{self, File};
use std::io;
use std::os::unix::fs::{symlink, MetadataExt};
use std::path::{Path, PathBuf};

/// Soma de blocos alocados (`st_blocks * 512`) sob `path`, sem seguir symlinks e
/// deduplicando hardlinks por `(dev, ino)`. Mesma regra de medição usada pelo scanner.
pub fn disk_usage_bytes(path: &Path) -> io::Result<u64> {
    let mut seen = std::collections::HashSet::new();
    let mut total = 0u64;
    walk(path, &mut seen, &mut total)?;
    Ok(total)
}

fn walk(
    path: &Path,
    seen: &mut std::collections::HashSet<(u64, u64)>,
    total: &mut u64,
) -> io::Result<()> {
    let meta = fs::symlink_metadata(path)?;
    if meta.file_type().is_symlink() {
        return Ok(());
    }
    if !seen.insert((meta.dev(), meta.ino())) {
        return Ok(());
    }
    *total += meta.blocks() * 512;
    if meta.is_dir() {
        for entry in fs::read_dir(path)? {
            walk(&entry?.path(), seen, total)?;
        }
    }
    Ok(())
}

/// Apesar do nome (mantido por compatibilidade com o resto do arquivo), escreve
/// dados reais em blocos em vez de só `set_len`: em APFS, um arquivo truncado
/// sem nunca receber escrita é só um buraco (`st_blocks == 0`), o que faria
/// qualquer teste que mede "bytes no disco" sobre esta fixture ver sempre 0 —
/// mesmo bug já corrigido localmente em `cleanup::tests` e `caches::tests`.
fn sparse_file(path: &Path, bytes: u64) -> io::Result<()> {
    use std::io::Write;

    fs::create_dir_all(path.parent().unwrap())?;
    let mut file = File::create(path)?;
    let chunk = vec![0u8; 64 * 1024];
    let mut remaining = bytes;
    while remaining > 0 {
        let n = remaining.min(chunk.len() as u64) as usize;
        file.write_all(&chunk[..n])?;
        remaining -= n as u64;
    }
    Ok(())
}

/// Um artefato criado por uma fixture, com o tamanho em disco que ele próprio ocupa.
#[derive(Debug, Clone)]
pub struct ArtifactFixture {
    pub path: PathBuf,
    pub bytes_on_disk: u64,
}

/// Um projeto criado por uma fixture, com seus artefatos regeneráveis.
#[derive(Debug, Clone)]
pub struct ProjectFixture {
    pub root: PathBuf,
    pub artifacts: Vec<ArtifactFixture>,
}

/// Projeto Node com `package.json` e um `node_modules/` esparso de ~`node_modules_mb` MB.
pub fn fixture_node_project(
    home: &Path,
    name: &str,
    node_modules_mb: u64,
) -> io::Result<ProjectFixture> {
    let root = home.join(name);
    fs::create_dir_all(&root)?;
    fs::write(
        root.join("package.json"),
        format!("{{\"name\":\"{name}\",\"version\":\"0.1.0\"}}"),
    )?;

    let node_modules = root.join("node_modules");
    sparse_file(
        &node_modules.join(".placeholder"),
        node_modules_mb * 1024 * 1024,
    )?;

    let artifact = ArtifactFixture {
        path: node_modules.clone(),
        bytes_on_disk: disk_usage_bytes(&node_modules)?,
    };
    Ok(ProjectFixture {
        root,
        artifacts: vec![artifact],
    })
}

/// Projeto Rust com `Cargo.toml`, `src/main.rs` e um `target/` esparso.
pub fn fixture_rust_project(home: &Path, name: &str, target_mb: u64) -> io::Result<ProjectFixture> {
    let root = home.join(name);
    fs::create_dir_all(root.join("src"))?;
    fs::write(
        root.join("Cargo.toml"),
        format!("[package]\nname = \"{name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n"),
    )?;
    fs::write(root.join("src/main.rs"), "fn main() {}\n")?;

    let target = root.join("target");
    sparse_file(&target.join("debug/.placeholder"), target_mb * 1024 * 1024)?;

    let artifact = ArtifactFixture {
        path: target.clone(),
        bytes_on_disk: disk_usage_bytes(&target)?,
    };
    Ok(ProjectFixture {
        root,
        artifacts: vec![artifact],
    })
}

/// Projeto Expo (React Native): `package.json` com dependência `expo`, `node_modules/`
/// e `.expo/` esparsos.
pub fn fixture_expo_project(
    home: &Path,
    name: &str,
    node_modules_mb: u64,
) -> io::Result<ProjectFixture> {
    let root = home.join(name);
    fs::create_dir_all(&root)?;
    fs::write(
        root.join("package.json"),
        format!("{{\"name\":\"{name}\",\"dependencies\":{{\"expo\":\"~51.0.0\"}}}}"),
    )?;
    fs::write(root.join("app.json"), "{\"expo\":{\"name\":\"app\"}}")?;

    let node_modules = root.join("node_modules");
    sparse_file(
        &node_modules.join(".placeholder"),
        node_modules_mb * 1024 * 1024,
    )?;
    let dot_expo = root.join(".expo");
    sparse_file(&dot_expo.join("cache.bin"), 1024 * 1024)?;

    let artifacts = vec![
        ArtifactFixture {
            path: node_modules.clone(),
            bytes_on_disk: disk_usage_bytes(&node_modules)?,
        },
        ArtifactFixture {
            path: dot_expo.clone(),
            bytes_on_disk: disk_usage_bytes(&dot_expo)?,
        },
    ];
    Ok(ProjectFixture { root, artifacts })
}

/// Projeto Flutter: `pubspec.yaml`, `build/` e `.dart_tool/` esparsos.
pub fn fixture_flutter_project(
    home: &Path,
    name: &str,
    build_mb: u64,
) -> io::Result<ProjectFixture> {
    let root = home.join(name);
    fs::create_dir_all(&root)?;
    fs::write(
        root.join("pubspec.yaml"),
        format!("name: {name}\nversion: 0.1.0\ndependencies:\n  flutter:\n    sdk: flutter\n"),
    )?;

    let build = root.join("build");
    sparse_file(
        &build.join("app/outputs/.placeholder"),
        build_mb * 1024 * 1024,
    )?;
    let dart_tool = root.join(".dart_tool");
    sparse_file(&dart_tool.join("package_config.json"), 4096)?;

    let artifacts = vec![
        ArtifactFixture {
            path: build.clone(),
            bytes_on_disk: disk_usage_bytes(&build)?,
        },
        ArtifactFixture {
            path: dart_tool.clone(),
            bytes_on_disk: disk_usage_bytes(&dart_tool)?,
        },
    ];
    Ok(ProjectFixture { root, artifacts })
}

/// Repositório git real (via `git2`) com um commit e uma mudança não commitada (dirty).
pub fn fixture_git_dirty_repo(home: &Path, name: &str) -> Result<PathBuf, git2::Error> {
    let root = home.join(name);
    fs::create_dir_all(&root).expect("create project dir");

    let repo = git2::Repository::init(&root)?;
    fs::write(root.join("README.md"), "# fixture\n").expect("write README");

    let mut index = repo.index()?;
    index.add_path(Path::new("README.md"))?;
    index.write()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;
    let signature = git2::Signature::now("Molt Fixture", "fixture@molt.test")?;
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        "initial commit",
        &tree,
        &[],
    )?;

    repo.remote("origin", "https://example.invalid/fixture.git")?;

    // Mudança não commitada: deixa o working tree dirty.
    fs::write(root.join("README.md"), "# fixture\n\nmudança local\n").expect("dirty README");

    Ok(root)
}

/// Store de conteúdo endereçável (como o store global do pnpm) com um arquivo real
/// hardlinkado em dois projetos diferentes, simulando deduplicação por `(dev, ino)`.
pub struct HardlinkedStoreFixture {
    pub store_file: PathBuf,
    pub linked_paths: Vec<PathBuf>,
    /// Tamanho em disco de uma única cópia física (todos os links compartilham o mesmo inode).
    pub physical_bytes_on_disk: u64,
}

pub fn fixture_hardlinked_store(home: &Path) -> io::Result<HardlinkedStoreFixture> {
    let store_dir = home.join(".pnpm-store/v3/files/ab");
    fs::create_dir_all(&store_dir)?;
    let store_file = store_dir.join("cd1234content");
    fs::write(&store_file, vec![b'x'; 256 * 1024])?;

    let mut linked_paths = Vec::new();
    for project in ["project-a", "project-b"] {
        let link_dir = home.join(project).join("node_modules/.pnpm/pkg@1.0.0");
        fs::create_dir_all(&link_dir)?;
        let link_path = link_dir.join("index.js");
        fs::hard_link(&store_file, &link_path)?;
        linked_paths.push(link_path);
    }

    let physical_bytes_on_disk = disk_usage_bytes(&store_file)?;
    Ok(HardlinkedStoreFixture {
        store_file,
        linked_paths,
        physical_bytes_on_disk,
    })
}

/// Diretório com um symlink que aponta para si mesmo, para garantir que o scanner
/// nunca segue symlinks (e portanto nunca entra em loop infinito).
pub fn fixture_symlink_loop(home: &Path, name: &str) -> io::Result<PathBuf> {
    let root = home.join(name);
    fs::create_dir_all(&root)?;
    fs::write(root.join("file.txt"), "conteudo")?;
    symlink(&root, root.join("self"))?;
    Ok(root)
}

/// Uma entrada de cache falsa, usada por `fixture_fake_caches`.
#[derive(Debug, Clone)]
pub struct CacheFixtureEntry {
    pub tool: String,
    pub path: PathBuf,
    pub bytes_on_disk: u64,
}

/// Monta um conjunto de caches falsas de ferramentas de dev dentro de `home`,
/// nos mesmos caminhos relativos que as ferramentas reais usam no macOS.
pub fn fixture_fake_caches(home: &Path) -> io::Result<Vec<CacheFixtureEntry>> {
    let entries: &[(&str, &str, u64)] = &[
        (
            "npm",
            "Library/Caches/npm/_cacache/content-v2/placeholder.bin",
            20,
        ),
        (
            "pnpm",
            ".local/share/pnpm/store/v3/files/placeholder.bin",
            20,
        ),
        ("yarn", "Library/Caches/Yarn/v6/placeholder.bin", 20),
        (
            "cocoapods",
            "Library/Caches/CocoaPods/Pods/placeholder.bin",
            20,
        ),
        ("gradle", ".gradle/caches/modules-2/placeholder.bin", 20),
        (
            "xcode",
            "Library/Developer/Xcode/DerivedData/App-hash/placeholder.bin",
            20,
        ),
        (
            "homebrew",
            "Library/Caches/Homebrew/downloads/placeholder.bin",
            20,
        ),
        (
            "docker",
            "Library/Containers/com.docker.docker/Data/vms/0/placeholder.bin",
            20,
        ),
    ];

    let mut result = Vec::new();
    for (tool, relative, mb) in entries {
        let path = home.join(relative);
        sparse_file(&path, mb * 1024 * 1024)?;
        result.push(CacheFixtureEntry {
            tool: tool.to_string(),
            path: path.clone(),
            bytes_on_disk: disk_usage_bytes(&path)?,
        });
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn node_project_reports_its_own_artifact_size() {
        let home = tempdir().unwrap();
        let fixture = fixture_node_project(home.path(), "app", 32).unwrap();
        assert_eq!(fixture.artifacts.len(), 1);
        // O valor reportado é o que o próprio fixture mediu, nunca um literal fixo.
        assert_eq!(
            fixture.artifacts[0].bytes_on_disk,
            disk_usage_bytes(&fixture.artifacts[0].path).unwrap()
        );
    }

    #[test]
    fn hardlinked_store_shares_one_inode() {
        let home = tempdir().unwrap();
        let fixture = fixture_hardlinked_store(home.path()).unwrap();
        let store_meta = fs::metadata(&fixture.store_file).unwrap();
        for linked in &fixture.linked_paths {
            let linked_meta = fs::metadata(linked).unwrap();
            assert_eq!(linked_meta.ino(), store_meta.ino());
        }
    }

    #[test]
    fn symlink_loop_does_not_blow_the_stack() {
        let home = tempdir().unwrap();
        let root = fixture_symlink_loop(home.path(), "looped").unwrap();
        // disk_usage_bytes não segue symlinks, então isso deve terminar rapidamente.
        let bytes = disk_usage_bytes(&root).unwrap();
        assert!(bytes > 0);
    }

    #[test]
    fn git_dirty_repo_has_a_commit_and_a_dirty_file() {
        let home = tempdir().unwrap();
        let root = fixture_git_dirty_repo(home.path(), "repo").unwrap();
        let repo = git2::Repository::open(&root).unwrap();
        assert!(repo.head().is_ok());
        assert!(repo
            .statuses(None)
            .unwrap()
            .iter()
            .any(|s| !s.status().is_empty()));
    }

    #[test]
    fn fake_caches_cover_every_known_tool() {
        let home = tempdir().unwrap();
        let entries = fixture_fake_caches(home.path()).unwrap();
        assert_eq!(entries.len(), 8);
        assert!(entries.iter().all(|e| e.path.exists()));
    }
}
