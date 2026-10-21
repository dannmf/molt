//! Infraestrutura para falar com o Docker: resolver o binário no `PATH` e rodar
//! comandos com timeout, sem shell. Duplicado de `caches::system` (em vez de
//! reaproveitado) porque esse módulo é privado a `caches/` e a convenção do
//! projeto é duplicar essa infraestrutura mínima por área em vez de criar
//! acoplamento entre módulos de catálogo independentes.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

/// Encontra o caminho absoluto de um binário no `PATH`, sem invocar shell.
pub trait BinaryResolver {
    fn resolve(&self, name: &str) -> Option<PathBuf>;
}

pub struct PathBinaryResolver;

impl BinaryResolver for PathBinaryResolver {
    fn resolve(&self, name: &str) -> Option<PathBuf> {
        let path_var = std::env::var_os("PATH")?;
        std::env::split_paths(&path_var)
            .map(|dir| dir.join(name))
            .find(|candidate| is_executable_file(candidate))
    }
}

fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(path) {
        Ok(meta) => meta.is_file() && meta.permissions().mode() & 0o111 != 0,
        Err(_) => false,
    }
}

/// Executa um comando externo já resolvido, devolvendo o `stdout` (lossy UTF-8,
/// sem trim) se ele terminar com sucesso dentro do timeout. Qualquer falha —
/// spawn, timeout, saída diferente de zero — resulta em `None`, nunca em panic
/// ou em travar a chamada indefinidamente.
pub trait CommandRunner {
    fn run(&self, program: &Path, args: &[&str], timeout: Duration) -> Option<String>;
}

pub struct TimeoutCommandRunner;

impl CommandRunner for TimeoutCommandRunner {
    fn run(&self, program: &Path, args: &[&str], timeout: Duration) -> Option<String> {
        let mut child = Command::new(program)
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
                    if start.elapsed() >= timeout {
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
}

/// Converte um tamanho formatado em base decimal (`"7.76GB"`, `"512MB"`,
/// `"0B"` — o formato usado pelo Docker) em bytes. Ignora qualquer sufixo após
/// o primeiro espaço (ex.: `"0B (virtual 1.21GB)"` nos containers).
pub fn parse_decimal_size(input: &str) -> Option<u64> {
    let token = input.split_whitespace().next()?;
    let unit_start = token.find(|c: char| c.is_alphabetic())?;
    let (number, unit) = token.split_at(unit_start);
    let value: f64 = number.parse().ok()?;
    if !value.is_finite() || value < 0.0 {
        return None;
    }
    let multiplier: f64 = match unit.to_ascii_uppercase().as_str() {
        "B" => 1.0,
        "KB" => 1_000.0,
        "MB" => 1_000_000.0,
        "GB" => 1_000_000_000.0,
        "TB" => 1_000_000_000_000.0,
        _ => return None,
    };
    Some((value * multiplier) as u64)
}

#[cfg(test)]
pub mod fakes {
    use super::*;
    use std::collections::HashMap;

    #[derive(Default)]
    pub struct FakeBinaryResolver {
        known: HashMap<String, PathBuf>,
    }

    impl FakeBinaryResolver {
        pub fn new() -> Self {
            Self::default()
        }

        pub fn with(mut self, name: &str) -> Self {
            self.known
                .insert(name.to_string(), PathBuf::from(format!("/fake/bin/{name}")));
            self
        }
    }

    impl BinaryResolver for FakeBinaryResolver {
        fn resolve(&self, name: &str) -> Option<PathBuf> {
            self.known.get(name).cloned()
        }
    }

    /// Executor falso: devolve uma saída pré-programada por *args* (join com
    /// espaço), pra diferenciar `docker ps` de `docker images` de `docker volume
    /// ls` mesmo todos resolvendo pro mesmo binário `docker`.
    #[derive(Default)]
    pub struct FakeCommandRunner {
        outputs: HashMap<String, String>,
    }

    impl FakeCommandRunner {
        pub fn new() -> Self {
            Self::default()
        }

        pub fn with_output(mut self, args_key: &str, output: &str) -> Self {
            self.outputs
                .insert(args_key.to_string(), output.to_string());
            self
        }
    }

    impl CommandRunner for FakeCommandRunner {
        fn run(&self, _program: &Path, args: &[&str], _timeout: Duration) -> Option<String> {
            self.outputs.get(&args.join(" ")).cloned()
        }
    }
}
