//! Teste ponta a ponta: varre um HOME falso do testkit com o scanner real e
//! limpa (em dry-run) exatamente os artefatos encontrados, confirmando que
//! `freed_bytes` bate com a soma dos bytes medidos pelo scanner — ou seja,
//! que as duas medições de disco (scanner e cleanup) nunca divergem.
//!
//! Roda no nível scanner+cleanup (não via comandos Tauri) porque
//! `commands::run_cleanup` resolve `ctx.home` com `dirs::home_dir()` (o HOME
//! real da máquina), e aqui o HOME é um `tempdir` fora da árvore do HOME real
//! — exatamente como os testes de unidade de `cleanup::tests` já fazem.

use molt_lib::cleanup::{self, CleanupContext, SystemCommandExecutor};
use molt_lib::detectors::{MoltArtifactDetector, MoltGitDetector, MoltKindDetector};
use molt_lib::model::{CleanupRequest, CleanupTarget, ScanRequest};
use molt_lib::scanner::{Detectors, JwalkScanner, Scanner};

#[test]
fn scan_then_dry_run_cleanup_frees_exactly_the_scanned_artifact_bytes() {
    let home = tempfile::tempdir().unwrap();
    molt_lib::testkit::fixture_node_project(home.path(), "app", 5).unwrap();
    molt_lib::testkit::fixture_rust_project(home.path(), "lib", 5).unwrap();

    let detectors = Detectors {
        kind: &MoltKindDetector,
        artifact: &MoltArtifactDetector,
        git: &MoltGitDetector,
    };
    let request = ScanRequest {
        roots: vec![home.path().to_path_buf()],
        max_depth: 6,
        ignore: vec![],
        excluded_paths: vec![],
    };
    let projects = JwalkScanner
        .scan(&request, &detectors, &mut |_| {})
        .expect("varredura da fixture não deveria falhar");

    assert_eq!(projects.len(), 2);
    let artifacts: Vec<_> = projects.iter().flat_map(|p| p.artifacts.clone()).collect();
    assert!(!artifacts.is_empty());
    let expected_bytes: u64 = artifacts.iter().map(|a| a.bytes).sum();

    let allowed_paths = artifacts.iter().map(|a| a.path.clone()).collect();
    let ctx = CleanupContext {
        home: home.path().to_path_buf(),
        allowed_paths,
        caches: vec![],
        executor: &SystemCommandExecutor,
    };
    let cleanup_request = CleanupRequest {
        targets: artifacts
            .iter()
            .map(|a| CleanupTarget::Artifact {
                path: a.path.clone(),
            })
            .collect(),
        dry_run: true,
        allow_dirty_git: false,
    };

    let result = cleanup::run_cleanup(cleanup_request, &ctx);

    assert!(result.dry_run);
    assert!(
        result.failed.is_empty(),
        "falhas inesperadas: {:?}",
        result.failed
    );
    assert_eq!(result.freed_bytes, expected_bytes);
}
