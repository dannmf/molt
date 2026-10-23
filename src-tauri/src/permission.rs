//! Detecção de Acesso Total ao Disco (Full Disk Access) no macOS. Não existe
//! API pública para solicitar essa permissão por código (diferente de
//! câmera/microfone/contatos); o app só pode detectar o estado atual e
//! direcionar o usuário aos Ajustes do Sistema.

use std::path::Path;

/// `/Library/Application Support/com.apple.TCC` só é listável por processos
/// com Acesso Total ao Disco — é o heurístico padrão usado por apps macOS
/// para detectar essa permissão, e o caminho existe em toda instalação,
/// independente do usuário logado.
const TCC_PROBE_PATH: &str = "/Library/Application Support/com.apple.TCC";

pub fn full_disk_access_granted() -> bool {
    is_readable(Path::new(TCC_PROBE_PATH))
}

fn is_readable(path: &Path) -> bool {
    std::fs::read_dir(path).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn readable_dir_is_reported_as_readable() {
        let dir = tempfile::tempdir().unwrap();
        assert!(is_readable(dir.path()));
    }

    #[test]
    fn unreadable_dir_is_reported_as_not_readable() {
        let dir = tempfile::tempdir().unwrap();
        let locked = dir.path().join("locked");
        fs::create_dir(&locked).unwrap();

        let original = fs::metadata(&locked).unwrap().permissions();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

        let result = is_readable(&locked);

        fs::set_permissions(&locked, original).unwrap();

        assert!(!result);
    }

    #[test]
    fn missing_path_is_reported_as_not_readable() {
        assert!(!is_readable(Path::new(
            "/caminho/que/definitivamente/nao/existe/molt-test"
        )));
    }
}
