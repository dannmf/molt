//! Medição de tamanho em disco: blocos alocados (`st_blocks * 512`), nunca
//! `st_size`; symlinks nunca são seguidos; hardlinks são deduplicados por
//! `(dev, ino)` usando um conjunto compartilhado entre threads (ver
//! `docs/architecture.md`). A mesma regra está implementada de forma
//! independente em `testkit::disk_usage_bytes`, que serve de oráculo nos testes.

use std::collections::HashSet;
use std::fs;
use std::io;
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::sync::Mutex;

/// Conjunto de `(dev, ino)` já contabilizados, compartilhado por toda a
/// varredura. Protegido por `Mutex` em vez de `DashMap`: o número de inserções
/// é da ordem de "arquivos por projeto", não "arquivos por segundo", então a
/// contenção de um lock único não chegou a aparecer como gargalo no benchmark
/// de 50 projetos (`scanner::tests::bench_fifty_projects`); se isso mudar, migrar
/// para `DashMap` exige uma nova dependência (ver `docs/contract-requests.md`).
#[derive(Default)]
pub struct SharedDedup {
    seen: Mutex<HashSet<(u64, u64)>>,
}

impl SharedDedup {
    pub fn new() -> Self {
        Self::default()
    }

    /// Soma os blocos alocados sob `path` (incluindo `path` em si), sem seguir
    /// symlinks e sem contar duas vezes um `(dev, ino)` já visto nesta
    /// varredura (por esta ou por outra chamada de `disk_usage_bytes`).
    /// Erros de permissão em subdiretórios são ignorados (a soma segue sem eles).
    pub fn disk_usage_bytes(&self, path: &Path) -> io::Result<u64> {
        let mut total = 0u64;
        self.walk(path, &mut total)?;
        Ok(total)
    }

    fn walk(&self, path: &Path, total: &mut u64) -> io::Result<()> {
        let meta = fs::symlink_metadata(path)?;
        if meta.file_type().is_symlink() {
            return Ok(());
        }
        {
            let mut seen = self.seen.lock().unwrap();
            if !seen.insert((meta.dev(), meta.ino())) {
                return Ok(());
            }
        }
        *total += meta.blocks() * 512;
        if meta.is_dir() {
            let entries = match fs::read_dir(path) {
                Ok(entries) => entries,
                // Diretório sem permissão de leitura: não derruba a varredura.
                Err(_) => return Ok(()),
            };
            for entry in entries {
                let entry = match entry {
                    Ok(entry) => entry,
                    Err(_) => continue,
                };
                // Um filho individual pode falhar (ex.: removido durante a varredura)
                // sem invalidar a soma do resto do diretório.
                let _ = self.walk(&entry.path(), total);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn dedups_hardlink_across_two_measurements() {
        let home = tempdir().unwrap();
        let file = home.path().join("content.bin");
        fs::write(&file, vec![0u8; 64 * 1024]).unwrap();
        let link = home.path().join("link.bin");
        fs::hard_link(&file, &link).unwrap();

        let dedup = SharedDedup::new();
        let first = dedup.disk_usage_bytes(&file).unwrap();
        assert!(first > 0);
        // O segundo caminho aponta pro mesmo inode: já foi contado.
        let second = dedup.disk_usage_bytes(&link).unwrap();
        assert_eq!(second, 0);
    }

    #[test]
    fn never_follows_symlinks() {
        let home = tempdir().unwrap();
        let target = home.path().join("target_dir");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("file.txt"), "conteudo").unwrap();
        std::os::unix::fs::symlink(&target, home.path().join("link_dir")).unwrap();

        let dedup = SharedDedup::new();
        // Medir o link não deve seguir para dentro de target_dir.
        let bytes = dedup
            .disk_usage_bytes(&home.path().join("link_dir"))
            .unwrap();
        assert_eq!(bytes, 0);
    }

    #[test]
    fn unreadable_subdirectory_is_skipped_not_fatal() {
        let home = tempdir().unwrap();
        let root = home.path().join("root");
        let locked = root.join("locked");
        let visible = root.join("visible.txt");
        fs::create_dir_all(&locked).unwrap();
        fs::write(&visible, "conteudo").unwrap();

        use std::os::unix::fs::PermissionsExt;
        let original = fs::metadata(&locked).unwrap().permissions();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

        let dedup = SharedDedup::new();
        let result = dedup.disk_usage_bytes(&root);

        // Restaura antes de qualquer asserção poder falhar e deixar o tempdir sujo.
        fs::set_permissions(&locked, original).unwrap();

        assert!(result.is_ok());
        assert!(result.unwrap() > 0, "deveria contar ao menos visible.txt");
    }
}
