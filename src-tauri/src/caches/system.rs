//! Infraestrutura para falar com o sistema: resolver binários no `PATH` e rodar
//! comandos externos com timeout, sem shell. Abstraído em traits para que os
//! testes do catálogo injetem um resolvedor/executor falso em vez de depender
//! de binários reais instalados na máquina que roda o teste.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

/// Timeout padrão para comandos de leitura usados só para descobrir um caminho
/// ou medir um tamanho (ex.: `brew --cache`, `pnpm store path`).
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

/// Encontra o caminho absoluto de um binário no `PATH`, sem invocar shell.
/// `Sync` porque o catálogo de caches mede várias entradas em paralelo (ver
/// `caches::list_caches_with`) sobre a mesma referência.
pub trait BinaryResolver: Sync {
    fn resolve(&self, name: &str) -> Option<PathBuf>;
}

/// Resolvedor real: procura `name` em cada diretório de `$PATH`, aceitando só
/// arquivos com bit de execução.
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
/// `Sync` pelo mesmo motivo de `BinaryResolver`: medido em paralelo pelo catálogo.
pub trait CommandRunner: Sync {
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
/// `"0B"` — o formato usado pelo Docker) em bytes. Ignora um sufixo de
/// porcentagem entre parênteses (`"1.1GB (34%)"`).
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

    /// Resolvedor falso: só "conhece" os binários explicitamente registrados.
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

    /// Executor falso: devolve uma saída pré-programada por nome de binário,
    /// nunca chega a rodar um processo de verdade.
    #[derive(Default)]
    pub struct FakeCommandRunner {
        outputs: HashMap<String, String>,
    }

    impl FakeCommandRunner {
        pub fn new() -> Self {
            Self::default()
        }

        pub fn with_output(mut self, program_name: &str, output: &str) -> Self {
            self.outputs
                .insert(program_name.to_string(), output.to_string());
            self
        }
    }

    impl CommandRunner for FakeCommandRunner {
        fn run(&self, program: &Path, _args: &[&str], _timeout: Duration) -> Option<String> {
            let name = program.file_name()?.to_str()?;
            self.outputs.get(name).cloned()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_decimal_sizes() {
        assert_eq!(parse_decimal_size("0B"), Some(0));
        assert_eq!(parse_decimal_size("512MB"), Some(512_000_000));
        assert_eq!(parse_decimal_size("1GB"), Some(1_000_000_000));
    }

    #[test]
    fn ignores_percentage_suffix() {
        assert_eq!(parse_decimal_size("1.1GB (34%)"), Some(1_100_000_000));
    }

    #[test]
    fn rejects_garbage() {
        assert_eq!(parse_decimal_size("not-a-size"), None);
        assert_eq!(parse_decimal_size(""), None);
    }

    #[test]
    fn real_resolver_finds_a_binary_that_surely_exists() {
        // `sh` existe em qualquer macOS/Unix; serve pra validar a busca no PATH
        // sem depender de uma ferramenta de dev específica estar instalada.
        let resolver = PathBinaryResolver;
        assert!(resolver.resolve("sh").is_some());
    }

    #[test]
    fn real_resolver_returns_none_for_unknown_binary() {
        let resolver = PathBinaryResolver;
        assert!(resolver
            .resolve("este-binario-nao-existe-com-certeza-absoluta")
            .is_none());
    }

    #[test]
    fn real_runner_runs_a_command_and_captures_stdout() {
        let runner = TimeoutCommandRunner;
        let echo = PathBinaryResolver.resolve("echo").unwrap();
        let output = runner.run(&echo, &["ola"], Duration::from_secs(2)).unwrap();
        assert_eq!(output.trim(), "ola");
    }

    #[test]
    fn real_runner_times_out_a_hanging_command() {
        let runner = TimeoutCommandRunner;
        let sleep = PathBinaryResolver.resolve("sleep").unwrap();
        let output = runner.run(&sleep, &["5"], Duration::from_millis(100));
        assert!(output.is_none());
    }
}
