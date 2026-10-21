//! Catálogo de caches de ferramentas de dev (Xcode, Gradle, npm/pnpm/yarn, CocoaPods,
//! Homebrew) e como limpá-las com segurança. Docker tem seu próprio catálogo em
//! `docker/`, separado deste.
//!
//! `list_caches` é a lógica real: percorre um catálogo fixo de locais conhecidos sob
//! `home` e devolve só o que existe e ocupa espaço de verdade — nunca "todo o
//! `~/Library/Caches`", só os itens deste catálogo (ver AGENTS.md, "Fora de escopo").
//!
//! A maioria das entradas é puramente baseada em filesystem (existe o diretório? qual o
//! tamanho?). Um punhado depende de um binário externo (`brew`, `pnpm`,
//! `xcrun`) para descobrir o caminho real ou decidir se a entrada aparece — essa parte
//! fica atrás de `BinaryResolver`/`CommandRunner` (`system.rs`) para os testes poderem
//! injetar resolvedores/execuções falsas em vez de depender do que está instalado na
//! máquina que roda `cargo test`.

mod system;

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::model::{CacheEntry, CacheRisk, CleanStrategy};
use system::{BinaryResolver, CommandRunner, PathBinaryResolver, TimeoutCommandRunner};

/// Lista as entradas de cache conhecidas presentes no `home` informado.
pub trait CacheCatalog {
    fn list(&self, home: &Path) -> Result<Vec<CacheEntry>, AppError>;
}

/// Implementação real de `CacheCatalog`, em cima de `list_caches`.
pub struct MoltCacheCatalog;

impl CacheCatalog for MoltCacheCatalog {
    fn list(&self, home: &Path) -> Result<Vec<CacheEntry>, AppError> {
        Ok(list_caches(home))
    }
}

/// Catálogo de caches de dev presentes em `home`. Só devolve entradas que existem e
/// ocupam espaço (bytes > 0) no disco, exceto a de simuladores indisponíveis, cuja
/// existência depende só do binário `xcrun` estar no `PATH` (o tamanho é uma estimativa
/// e pode ser 0 se não for possível medir — ver `unavailable_simulators`).
pub fn list_caches(home: &Path) -> Vec<CacheEntry> {
    list_caches_with(home, &PathBinaryResolver, &TimeoutCommandRunner)
}

fn list_caches_with(
    home: &Path,
    resolver: &dyn BinaryResolver,
    runner: &dyn CommandRunner,
) -> Vec<CacheEntry> {
    let mut entries: Vec<CacheEntry> = SIMPLE_CACHE_RULES
        .iter()
        .filter_map(|rule| rule.build(home))
        .collect();

    entries.extend(ios_device_support_old(home));
    entries.extend(unavailable_simulators(home, resolver));
    entries.extend(android_avds(home));
    entries.extend(pnpm_store(home, resolver, runner));
    entries.extend(homebrew_cache(resolver, runner));

    entries
}

/// Soma de blocos alocados (`st_blocks * 512`) sob `path`, sem seguir symlinks e
/// deduplicando hardlinks por `(dev, ino)` dentro desta chamada. Mesma regra de medição
/// documentada em `docs/architecture.md`. Qualquer erro de I/O (permissão, caminho
/// removido entre o `exists()` e a varredura) é tratado como "0 bytes daquele galho",
/// não como falha — uma entrada de cache não deveria desaparecer o app por um
/// subdiretório ilegível.
fn dir_bytes(path: &Path) -> u64 {
    let mut seen = std::collections::HashSet::new();
    let mut total = 0u64;
    walk_dir_bytes(path, &mut seen, &mut total);
    total
}

fn walk_dir_bytes(path: &Path, seen: &mut std::collections::HashSet<(u64, u64)>, total: &mut u64) {
    use std::os::unix::fs::MetadataExt;

    let Ok(meta) = fs::symlink_metadata(path) else {
        return;
    };
    if meta.file_type().is_symlink() {
        return;
    }
    if !seen.insert((meta.dev(), meta.ino())) {
        return;
    }
    *total += meta.blocks() * 512;
    if meta.is_dir() {
        let Ok(read_dir) = fs::read_dir(path) else {
            return;
        };
        for entry in read_dir.flatten() {
            walk_dir_bytes(&entry.path(), seen, total);
        }
    }
}

/// Uma entrada do catálogo cujo critério de existência é só "um ou mais destes
/// caminhos relativos a `home` existem e somam bytes > 0" e cuja limpeza é sempre
/// mandar os caminhos existentes para a Lixeira. Cobre a maioria do catálogo; as
/// entradas que dependem de um binário externo ou que geram várias `CacheEntry`s
/// (uma por item, como os AVDs) ficam fora desta tabela.
struct SimpleCacheRule {
    id: &'static str,
    label: &'static str,
    tool: &'static str,
    relative_paths: &'static [&'static str],
    risk: CacheRisk,
    description: &'static str,
}

impl SimpleCacheRule {
    fn build(&self, home: &Path) -> Option<CacheEntry> {
        let existing: Vec<PathBuf> = self
            .relative_paths
            .iter()
            .map(|relative| home.join(relative))
            .filter(|path| path.is_dir())
            .collect();
        if existing.is_empty() {
            return None;
        }
        let bytes: u64 = existing.iter().map(|path| dir_bytes(path)).sum();
        if bytes == 0 {
            return None;
        }
        Some(CacheEntry {
            id: self.id.to_string(),
            label: self.label.to_string(),
            tool: self.tool.to_string(),
            paths: existing.clone(),
            bytes,
            risk: self.risk,
            strategy: CleanStrategy::Trash { paths: existing },
            description: self.description.to_string(),
        })
    }
}

const SIMPLE_CACHE_RULES: &[SimpleCacheRule] = &[
    SimpleCacheRule {
        id: "xcode-derived-data",
        label: "Xcode DerivedData",
        tool: "Xcode",
        relative_paths: &["Library/Developer/Xcode/DerivedData"],
        risk: CacheRisk::Rebuildable,
        description: "Builds intermediárias do Xcode, recriadas no próximo build.",
    },
    SimpleCacheRule {
        id: "xcode-archives",
        label: "Xcode Archives",
        tool: "Xcode",
        relative_paths: &["Library/Developer/Xcode/Archives"],
        risk: CacheRisk::Caution,
        description: "Arquivos de release (.xcarchive) usados para re-exportar builds já enviados — apagar perde o histórico de symbols para debug de crashes antigos.",
    },
    SimpleCacheRule {
        id: "core-simulator-caches",
        label: "Cache do CoreSimulator",
        tool: "Xcode",
        relative_paths: &["Library/Developer/CoreSimulator/Caches"],
        risk: CacheRisk::Safe,
        description: "Cache interno do runtime de simuladores iOS, recriado sob demanda.",
    },
    SimpleCacheRule {
        id: "gradle-caches",
        label: "Gradle (caches e wrapper)",
        tool: "Gradle",
        relative_paths: &[".gradle/caches", ".gradle/wrapper/dists"],
        risk: CacheRisk::Rebuildable,
        description: "Dependências baixadas e distribuições do Gradle Wrapper, baixadas de novo no próximo build.",
    },
    SimpleCacheRule {
        id: "npm-cache",
        label: "npm cache",
        tool: "npm",
        relative_paths: &[".npm/_cacache"],
        risk: CacheRisk::Rebuildable,
        description: "Cache de pacotes do npm, recriada no próximo install.",
    },
    SimpleCacheRule {
        id: "yarn-cache",
        label: "Yarn cache",
        tool: "Yarn",
        relative_paths: &["Library/Caches/Yarn"],
        risk: CacheRisk::Rebuildable,
        description: "Cache de pacotes do Yarn, recriada no próximo install.",
    },
    SimpleCacheRule {
        id: "cocoapods-cache",
        label: "CocoaPods cache",
        tool: "CocoaPods",
        relative_paths: &["Library/Caches/CocoaPods"],
        risk: CacheRisk::Rebuildable,
        description: "Specs e pods baixados pelo CocoaPods, recriados no próximo pod install.",
    },
];

/// Subpastas de "iOS DeviceSupport" além da mais recente — cada uma guarda os symbols
/// de debug de uma versão de iOS já conectada via USB; a mais nova é mantida porque é a
/// mais provável de ainda estar em uso.
fn ios_device_support_old(home: &Path) -> Option<CacheEntry> {
    let root = home.join("Library/Developer/Xcode/iOS DeviceSupport");
    let read_dir = fs::read_dir(&root).ok()?;

    let mut versions: Vec<(PathBuf, std::time::SystemTime)> = read_dir
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((entry.path(), modified))
        })
        .collect();
    versions.sort_by_key(|(_, modified)| *modified);

    // A última (mais recente) fica; o resto é considerado "antigo".
    let old: Vec<PathBuf> = versions
        .into_iter()
        .rev()
        .skip(1)
        .map(|(path, _)| path)
        .collect();
    if old.is_empty() {
        return None;
    }

    let bytes: u64 = old.iter().map(|path| dir_bytes(path)).sum();
    if bytes == 0 {
        return None;
    }

    Some(CacheEntry {
        id: "ios-device-support-old".to_string(),
        label: "iOS DeviceSupport (versões antigas)".to_string(),
        tool: "Xcode".to_string(),
        paths: old.clone(),
        bytes,
        risk: CacheRisk::Rebuildable,
        strategy: CleanStrategy::Trash { paths: old },
        description: "Symbols de debug de versões de iOS antigas; recriados ao reconectar um dispositivo com essa versão.".to_string(),
    })
}

/// Simuladores iOS indisponíveis (runtime removido, dispositivo corrompido etc.).
/// Só aparece se `xcrun` estiver no `PATH` — é ele que de fato decide quais simuladores
/// estão indisponíveis na hora da limpeza (`cleanup/`, fora de escopo aqui). O tamanho
/// é uma estimativa a partir do diretório de todos os dispositivos (inclui os
/// disponíveis também, já que não dá pra saber qual é qual sem rodar `simctl list`).
fn unavailable_simulators(home: &Path, resolver: &dyn BinaryResolver) -> Option<CacheEntry> {
    resolver.resolve("xcrun")?;

    let devices_dir = home.join("Library/Developer/CoreSimulator/Devices");
    let (bytes, description) = if devices_dir.is_dir() {
        (
            dir_bytes(&devices_dir),
            "Tamanho estimado a partir de todos os dispositivos simulados; a limpeza remove só os indisponíveis.".to_string(),
        )
    } else {
        (
            0,
            "Tamanho não pôde ser estimado (diretório de dispositivos não encontrado); a limpeza remove os simuladores indisponíveis mesmo assim.".to_string(),
        )
    };

    Some(CacheEntry {
        id: "core-simulator-unavailable".to_string(),
        label: "Simuladores indisponíveis".to_string(),
        tool: "Xcode".to_string(),
        paths: vec![devices_dir],
        bytes,
        risk: CacheRisk::Safe,
        strategy: CleanStrategy::Command {
            program: "xcrun".to_string(),
            args: vec![
                "simctl".to_string(),
                "delete".to_string(),
                "unavailable".to_string(),
            ],
        },
        description,
    })
}

/// Um `CacheEntry` por AVD do Android (`~/.android/avd/<nome>.avd`).
fn android_avds(home: &Path) -> Vec<CacheEntry> {
    let avd_dir = home.join(".android/avd");
    let Ok(read_dir) = fs::read_dir(&avd_dir) else {
        return Vec::new();
    };

    read_dir
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_stem()?.to_str()?.to_string();
            if path.extension().and_then(|ext| ext.to_str()) != Some("avd") {
                return None;
            }
            let bytes = dir_bytes(&path);
            if bytes == 0 {
                return None;
            }
            Some(CacheEntry {
                id: format!("android-avd-{name}"),
                label: format!("AVD: {name}"),
                tool: "Android Studio".to_string(),
                paths: vec![path.clone()],
                bytes,
                risk: CacheRisk::Caution,
                strategy: CleanStrategy::Trash { paths: vec![path] },
                description: "Imagem de disco de um emulador Android; apagar remove o emulador e seus dados (apps instalados, snapshots).".to_string(),
            })
        })
        .collect()
}

/// Store de conteúdo endereçável do pnpm. Se o binário existir, usa `pnpm store path`
/// para achar o caminho real e prefere `pnpm store prune` como estratégia de limpeza
/// (mais seguro que apagar a pasta inteira, já que o store pode ser compartilhado por
/// outras versões do pnpm). Sem o binário, cai no caminho padrão do macOS e usa Trash.
fn pnpm_store(
    home: &Path,
    resolver: &dyn BinaryResolver,
    runner: &dyn CommandRunner,
) -> Option<CacheEntry> {
    let default_path = home.join("Library/pnpm/store/v3");

    let (path, strategy) = match resolver.resolve("pnpm") {
        Some(pnpm) => {
            let discovered = runner
                .run(&pnpm, &["store", "path"], system::DEFAULT_TIMEOUT)
                .map(|output| PathBuf::from(output.trim()))
                .filter(|path| !path.as_os_str().is_empty())
                .unwrap_or_else(|| default_path.clone());
            (
                discovered,
                CleanStrategy::Command {
                    program: "pnpm".to_string(),
                    args: vec!["store".to_string(), "prune".to_string()],
                },
            )
        }
        None => (
            default_path.clone(),
            CleanStrategy::Trash {
                paths: vec![default_path.clone()],
            },
        ),
    };

    if !path.is_dir() {
        return None;
    }
    let bytes = dir_bytes(&path);
    if bytes == 0 {
        return None;
    }

    Some(CacheEntry {
        id: "pnpm-store".to_string(),
        label: "pnpm store".to_string(),
        tool: "pnpm".to_string(),
        paths: vec![path],
        bytes,
        risk: CacheRisk::Rebuildable,
        strategy,
        description: "Store de conteúdo endereçável do pnpm, recriado no próximo install."
            .to_string(),
    })
}

/// Cache do Homebrew (downloads de bottles/fórmulas). Só aparece se `brew` estiver no
/// `PATH`; o caminho real vem de `brew --cache` em vez de assumir um local fixo.
fn homebrew_cache(resolver: &dyn BinaryResolver, runner: &dyn CommandRunner) -> Option<CacheEntry> {
    let brew = resolver.resolve("brew")?;
    let output = runner.run(&brew, &["--cache"], system::DEFAULT_TIMEOUT)?;
    let path = PathBuf::from(output.trim());
    if !path.is_dir() {
        return None;
    }
    let bytes = dir_bytes(&path);
    if bytes == 0 {
        return None;
    }

    Some(CacheEntry {
        id: "homebrew-cache".to_string(),
        label: "Homebrew cache".to_string(),
        tool: "Homebrew".to_string(),
        paths: vec![path],
        bytes,
        risk: CacheRisk::Safe,
        strategy: CleanStrategy::Command {
            program: "brew".to_string(),
            args: vec!["cleanup".to_string(), "--prune=all".to_string()],
        },
        description: "Downloads de fórmulas e bottles já instalados, baixados de novo se precisar reinstalar.".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::CleanStrategy as CS;
    use std::time::Duration;
    use system::fakes::{FakeBinaryResolver, FakeCommandRunner};
    use tempfile::tempdir;

    /// Escreve `bytes` de conteúdo real (não um arquivo esparso via `set_len`): neste
    /// filesystem, `ftruncate`/`set_len` sem escrever dados aloca zero blocos, então
    /// `dir_bytes` (que mede `st_blocks`) veria sempre 0 e os testes de tamanho não
    /// testariam nada.
    fn sparse_file(path: &Path, bytes: u64) {
        use std::io::Write;
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut file = fs::File::create(path).unwrap();
        let chunk = vec![0u8; 64 * 1024];
        let mut remaining = bytes;
        while remaining > 0 {
            let n = remaining.min(chunk.len() as u64) as usize;
            file.write_all(&chunk[..n]).unwrap();
            remaining -= n as u64;
        }
    }

    fn no_resolver() -> FakeBinaryResolver {
        FakeBinaryResolver::new()
    }

    fn no_runner() -> FakeCommandRunner {
        FakeCommandRunner::new()
    }

    #[test]
    fn empty_home_has_no_entries() {
        let home = tempdir().unwrap();
        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        assert!(entries.is_empty());
    }

    #[test]
    fn detects_xcode_derived_data() {
        let home = tempdir().unwrap();
        sparse_file(
            &home
                .path()
                .join("Library/Developer/Xcode/DerivedData/App-abc/data.bin"),
            1024 * 1024,
        );

        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        let entry = entries
            .iter()
            .find(|e| e.id == "xcode-derived-data")
            .unwrap();
        assert_eq!(entry.risk, CacheRisk::Rebuildable);
        assert!(entry.bytes > 0);
        assert!(matches!(&entry.strategy, CS::Trash { paths } if paths.len() == 1));
    }

    #[test]
    fn missing_cache_dirs_do_not_appear() {
        let home = tempdir().unwrap();
        sparse_file(
            &home
                .path()
                .join("Library/Developer/Xcode/DerivedData/x.bin"),
            1024,
        );

        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        assert!(!entries.iter().any(|e| e.id == "xcode-archives"));
        assert!(!entries.iter().any(|e| e.id == "npm-cache"));
    }

    #[test]
    fn empty_existing_dir_does_not_appear() {
        let home = tempdir().unwrap();
        fs::create_dir_all(home.path().join("Library/Caches/CocoaPods")).unwrap();

        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        assert!(!entries.iter().any(|e| e.id == "cocoapods-cache"));
    }

    #[test]
    fn gradle_entry_sums_caches_and_wrapper_dists() {
        let home = tempdir().unwrap();
        sparse_file(
            &home.path().join(".gradle/caches/modules-2/x.bin"),
            2 * 1024 * 1024,
        );
        sparse_file(
            &home.path().join(".gradle/wrapper/dists/gradle-8/x.bin"),
            3 * 1024 * 1024,
        );

        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        let entry = entries.iter().find(|e| e.id == "gradle-caches").unwrap();
        assert_eq!(entry.paths.len(), 2);
    }

    #[test]
    fn keeps_newest_ios_device_support_and_flags_the_rest_as_old() {
        let home = tempdir().unwrap();
        let base = home
            .path()
            .join("Library/Developer/Xcode/iOS DeviceSupport");
        for (version, mb) in [("17.0", 10u64), ("17.1", 10u64), ("17.2", 10u64)] {
            sparse_file(&base.join(version).join("Symbols/x.bin"), mb * 1024 * 1024);
        }
        // Garante uma ordem de mtime previsível independente da ordem de criação.
        let now = std::time::SystemTime::now();
        filetime_touch(&base.join("17.0"), now - Duration::from_secs(300));
        filetime_touch(&base.join("17.1"), now - Duration::from_secs(200));
        filetime_touch(&base.join("17.2"), now - Duration::from_secs(100));

        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        let entry = entries
            .iter()
            .find(|e| e.id == "ios-device-support-old")
            .unwrap();
        assert_eq!(entry.paths.len(), 2);
        assert!(!entry.paths.iter().any(|p| p.ends_with("17.2")));
    }

    fn filetime_touch(path: &Path, when: std::time::SystemTime) {
        let accessed = when;
        let modified = when;
        let file = fs::File::open(path).unwrap();
        let _ = file.set_modified(modified);
        let _ = accessed;
    }

    #[test]
    fn single_ios_device_support_version_has_no_old_entry() {
        let home = tempdir().unwrap();
        sparse_file(
            &home
                .path()
                .join("Library/Developer/Xcode/iOS DeviceSupport/17.0/Symbols/x.bin"),
            1024 * 1024,
        );

        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        assert!(!entries.iter().any(|e| e.id == "ios-device-support-old"));
    }

    #[test]
    fn unavailable_simulators_absent_without_xcrun() {
        let home = tempdir().unwrap();
        sparse_file(
            &home
                .path()
                .join("Library/Developer/CoreSimulator/Devices/ABC/data.bin"),
            1024 * 1024,
        );

        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        assert!(!entries.iter().any(|e| e.id == "core-simulator-unavailable"));
    }

    #[test]
    fn unavailable_simulators_appears_with_estimated_bytes_when_xcrun_exists() {
        let home = tempdir().unwrap();
        sparse_file(
            &home
                .path()
                .join("Library/Developer/CoreSimulator/Devices/ABC/data.bin"),
            1024 * 1024,
        );
        let resolver = no_resolver().with("xcrun");

        let entries = list_caches_with(home.path(), &resolver, &no_runner());
        let entry = entries
            .iter()
            .find(|e| e.id == "core-simulator-unavailable")
            .unwrap();
        assert!(entry.bytes > 0);
        assert!(matches!(&entry.strategy, CS::Command { program, .. } if program == "xcrun"));
    }

    #[test]
    fn unavailable_simulators_appears_with_zero_bytes_when_devices_dir_is_missing() {
        let home = tempdir().unwrap();
        let resolver = no_resolver().with("xcrun");

        let entries = list_caches_with(home.path(), &resolver, &no_runner());
        let entry = entries
            .iter()
            .find(|e| e.id == "core-simulator-unavailable")
            .unwrap();
        assert_eq!(entry.bytes, 0);
    }

    #[test]
    fn one_entry_per_avd() {
        let home = tempdir().unwrap();
        sparse_file(
            &home.path().join(".android/avd/Pixel_7.avd/data.bin"),
            5 * 1024 * 1024,
        );
        sparse_file(
            &home.path().join(".android/avd/Nexus_5.avd/data.bin"),
            3 * 1024 * 1024,
        );

        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        let avds: Vec<_> = entries
            .iter()
            .filter(|e| e.id.starts_with("android-avd-"))
            .collect();
        assert_eq!(avds.len(), 2);
        assert!(avds.iter().any(|e| e.label == "AVD: Pixel_7"));
        assert!(avds.iter().any(|e| e.label == "AVD: Nexus_5"));
    }

    #[test]
    fn pnpm_falls_back_to_default_path_without_binary() {
        let home = tempdir().unwrap();
        sparse_file(
            &home.path().join("Library/pnpm/store/v3/files/x.bin"),
            1024 * 1024,
        );

        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        let entry = entries.iter().find(|e| e.id == "pnpm-store").unwrap();
        assert!(matches!(&entry.strategy, CS::Trash { .. }));
    }

    #[test]
    fn pnpm_uses_discovered_path_and_prune_command_when_binary_exists() {
        let home = tempdir().unwrap();
        let real_store = home.path().join("custom/pnpm-store");
        sparse_file(&real_store.join("files/x.bin"), 2 * 1024 * 1024);

        let resolver = no_resolver().with("pnpm");
        let runner = no_runner().with_output("pnpm", &format!("{}\n", real_store.display()));

        let entries = list_caches_with(home.path(), &resolver, &runner);
        let entry = entries.iter().find(|e| e.id == "pnpm-store").unwrap();
        assert_eq!(entry.paths, vec![real_store]);
        assert!(matches!(&entry.strategy, CS::Command { program, .. } if program == "pnpm"));
    }

    #[test]
    fn pnpm_absent_when_neither_binary_nor_default_path_exist() {
        let home = tempdir().unwrap();
        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        assert!(!entries.iter().any(|e| e.id == "pnpm-store"));
    }

    #[test]
    fn homebrew_absent_without_binary() {
        let home = tempdir().unwrap();
        let entries = list_caches_with(home.path(), &no_resolver(), &no_runner());
        assert!(!entries.iter().any(|e| e.id == "homebrew-cache"));
    }

    #[test]
    fn homebrew_uses_discovered_cache_path() {
        let home = tempdir().unwrap();
        let cache_dir = home.path().join("Library/Caches/Homebrew");
        sparse_file(&cache_dir.join("downloads/x.bin"), 4 * 1024 * 1024);

        let resolver = no_resolver().with("brew");
        let runner = no_runner().with_output("brew", &format!("{}\n", cache_dir.display()));

        let entries = list_caches_with(home.path(), &resolver, &runner);
        let entry = entries.iter().find(|e| e.id == "homebrew-cache").unwrap();
        assert!(entry.bytes > 0);
        assert!(matches!(&entry.strategy, CS::Command { program, .. } if program == "brew"));
    }

    #[test]
    fn dir_bytes_does_not_follow_symlinks() {
        let home = tempdir().unwrap();
        let real = home.path().join("real");
        fs::create_dir_all(&real).unwrap();
        sparse_file(&real.join("x.bin"), 1024 * 1024);
        let looped = real.join("self");
        std::os::unix::fs::symlink(&real, &looped).unwrap();

        // Não deve entrar em loop infinito nem contar o conteúdo apontado de novo.
        let bytes = dir_bytes(&real);
        assert!(bytes > 0);
    }
}
