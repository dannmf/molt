//! Uso de disco do volume onde um caminho está montado, via `df`/`diskutil` —
//! não há crate própria de disco no projeto (ver Cargo.toml). Resolve o binário
//! no `PATH` e roda sem shell, com timeout, igual à regra de `AGENTS.md`
//! ("Comandos externos: sem shell, com timeout, binário resolvido no PATH").
//!
//! O mesmo padrão já existe em `caches::system` e em `cleanup::run_with_timeout`,
//! mas nenhum dos dois pode ser reaproveitado daqui: `caches::system` é privado a
//! `caches/`, e a versão em `cleanup` não captura stdout (ver
//! `docs/contract-requests.md`).

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use crate::error::AppError;
use crate::model::DiskUsage;

const TIMEOUT: Duration = Duration::from_secs(5);

/// Rótulo usado quando `diskutil info` não devolve (ou não tem) um "Volume Name".
const FALLBACK_VOLUME_NAME: &str = "Disco";

pub fn disk_usage(path: &Path) -> Result<DiskUsage, AppError> {
    let path_str = path.to_string_lossy().into_owned();

    let df_output = run("df", &["-k", &path_str]).ok_or_else(|| {
        AppError::CommandFailed("'df' falhou ou não respondeu a tempo".to_string())
    })?;
    let (total_bytes, free_bytes) = parse_df_output(&df_output)
        .ok_or_else(|| AppError::Other("saída inesperada de 'df -k'".to_string()))?;

    let volume_name = run("diskutil", &["info", &path_str])
        .and_then(|output| parse_volume_name(&output))
        .unwrap_or_else(|| FALLBACK_VOLUME_NAME.to_string());

    Ok(DiskUsage {
        volume_name,
        total_bytes,
        free_bytes,
    })
}

fn resolve_binary(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var)
        .map(|dir| dir.join(name))
        .find(|candidate| is_executable_file(candidate))
}

fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(path) {
        Ok(meta) => meta.is_file() && meta.permissions().mode() & 0o111 != 0,
        Err(_) => false,
    }
}

/// Roda `program` sem shell e devolve o `stdout` (lossy UTF-8) se ele terminar
/// com sucesso dentro do timeout. Qualquer falha — binário ausente, spawn,
/// timeout, saída diferente de zero — resulta em `None`, nunca em panic.
fn run(program: &str, args: &[&str]) -> Option<String> {
    let resolved = resolve_binary(program)?;

    let mut child = Command::new(resolved)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout.read_to_string(&mut buf);
        let _ = tx.send(buf);
    });

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                return rx.recv_timeout(Duration::from_millis(500)).ok();
            }
            Ok(None) => {
                if start.elapsed() >= TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                thread::sleep(Duration::from_millis(20));
            }
            Err(_) => return None,
        }
    }
}

/// A linha de dados do `df -k` vem depois do cabeçalho; colunas:
/// `Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on`.
fn parse_df_output(output: &str) -> Option<(u64, u64)> {
    let data_line = output.lines().nth(1)?;
    let cols: Vec<&str> = data_line.split_whitespace().collect();
    let total_kb: u64 = cols.get(1)?.parse().ok()?;
    let available_kb: u64 = cols.get(3)?.parse().ok()?;
    Some((total_kb * 1024, available_kb * 1024))
}

fn parse_volume_name(output: &str) -> Option<String> {
    output
        .lines()
        .find(|line| line.trim_start().starts_with("Volume Name:"))
        .and_then(|line| line.split_once(':'))
        .map(|(_, value)| value.trim().to_string())
        .filter(|name| !name.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_df_k_output() {
        let output = "Filesystem   1024-blocks      Used Available Capacity iused   ifree %iused  Mounted on\n/dev/disk3s1s1  974569680 123456789 460000000    22%  943210 4604567    1%   /\n";
        assert_eq!(
            parse_df_output(output),
            Some((974_569_680 * 1024, 460_000_000 * 1024))
        );
    }

    #[test]
    fn rejects_malformed_df_output() {
        assert_eq!(parse_df_output("Filesystem\n"), None);
        assert_eq!(parse_df_output(""), None);
    }

    #[test]
    fn parses_volume_name_from_diskutil_info() {
        let output = "   Device Identifier:        disk3s1s1\n   Volume Name:              Macintosh HD\n   Mounted:                  Yes\n";
        assert_eq!(parse_volume_name(output), Some("Macintosh HD".to_string()));
    }

    #[test]
    fn falls_back_when_volume_name_missing_or_empty() {
        assert_eq!(parse_volume_name("   Volume Name:              \n"), None);
        assert_eq!(parse_volume_name("no relevant lines here"), None);
    }
}
