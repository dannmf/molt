//! Serializa um exemplo de cada tipo de `model.rs` e compara com `fixtures/model-snapshot.json`.
//!
//! O mesmo arquivo é lido pelo Vitest (`src/api/__tests__/types.test.ts`) e comparado
//! contra um literal TypeScript tipado por `src/types.ts`. Se os dois lados baterem com
//! o fixture, eles batem entre si: é assim que garantimos `types.ts` 1:1 com `model.rs`.

use molt_lib::model::{
    Artifact, ArtifactKind, CacheEntry, CacheRisk, CleanStrategy, CleanupRequest, CleanupResult,
    CleanupTarget, GitInfo, Project, ProjectKind, ScanProgress, ScanRequest,
};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
struct ModelSnapshot {
    project: Project,
    project_without_git: Project,
    cache_entries: Vec<CacheEntry>,
    scan_request: ScanRequest,
    scan_progress: ScanProgress,
    cleanup_request: CleanupRequest,
    cleanup_result: CleanupResult,
}

fn build_snapshot() -> ModelSnapshot {
    let project = Project {
        id: "a1b2c3".to_string(),
        name: "molt".to_string(),
        path: PathBuf::from("/Users/dev/molt"),
        kinds: vec![ProjectKind::Rust, ProjectKind::Node],
        total_bytes: 1_800_000_000,
        reclaimable_bytes: 1_200_000_000,
        artifacts: vec![
            Artifact {
                path: PathBuf::from("/Users/dev/molt/src-tauri/target"),
                kind: ArtifactKind::RustTarget,
                bytes: 900_000_000,
                regenerate_hint: "cargo build".to_string(),
            },
            Artifact {
                path: PathBuf::from("/Users/dev/molt/.cache/custom"),
                kind: ArtifactKind::Other("CustomTool".to_string()),
                bytes: 1_000,
                regenerate_hint: "custom-tool build".to_string(),
            },
        ],
        last_modified_at: 1_732_000_000,
        git: Some(GitInfo {
            branch: Some("main".to_string()),
            last_commit_at: Some(1_732_000_000),
            dirty: true,
            unpushed_commits: 2,
            has_remote: true,
        }),
    };

    let project_without_git = Project {
        id: "d4e5f6".to_string(),
        name: "scratch".to_string(),
        path: PathBuf::from("/Users/dev/scratch"),
        kinds: vec![ProjectKind::Unknown],
        total_bytes: 0,
        reclaimable_bytes: 0,
        artifacts: vec![],
        last_modified_at: 1_700_000_000,
        git: None,
    };

    let cache_entries = vec![
        CacheEntry {
            id: "npm-cache".to_string(),
            label: "npm cache".to_string(),
            tool: "npm".to_string(),
            paths: vec![PathBuf::from("/Users/dev/.npm/_cacache")],
            bytes: 1_400_000_000,
            risk: CacheRisk::Safe,
            strategy: CleanStrategy::Command {
                program: "npm".to_string(),
                args: vec![
                    "cache".to_string(),
                    "clean".to_string(),
                    "--force".to_string(),
                ],
            },
            description: "Cache de pacotes do npm.".to_string(),
        },
        CacheEntry {
            id: "xcode-derived-data".to_string(),
            label: "Xcode DerivedData".to_string(),
            tool: "xcode".to_string(),
            paths: vec![PathBuf::from(
                "/Users/dev/Library/Developer/Xcode/DerivedData",
            )],
            bytes: 8_200_000_000,
            risk: CacheRisk::Rebuildable,
            strategy: CleanStrategy::Trash {
                paths: vec![PathBuf::from(
                    "/Users/dev/Library/Developer/Xcode/DerivedData",
                )],
            },
            description: "Build intermediário do Xcode.".to_string(),
        },
    ];

    let scan_request = ScanRequest {
        roots: vec![PathBuf::from("/Users/dev")],
        max_depth: 6,
        ignore: vec!["node_modules".to_string(), ".git".to_string()],
        excluded_paths: vec![PathBuf::from("/Users/dev/old-project")],
    };

    let scan_progress = ScanProgress {
        scanned_dirs: 4_200,
        projects_found: 15,
        current_path: "/Users/dev/molt".to_string(),
    };

    let cleanup_request = CleanupRequest {
        targets: vec![
            CleanupTarget::Artifact {
                path: PathBuf::from("/Users/dev/molt/node_modules"),
            },
            CleanupTarget::Project {
                path: PathBuf::from("/Users/dev/old-project"),
            },
            CleanupTarget::Cache {
                id: "npm-cache".to_string(),
            },
        ],
        dry_run: false,
        allow_dirty_git: false,
    };

    let cleanup_result = CleanupResult {
        freed_bytes: 1_200_000_000,
        removed: vec![PathBuf::from("/Users/dev/molt/node_modules")],
        failed: vec![(
            PathBuf::from("/Users/dev/old-project"),
            "projeto com alterações não commitadas".to_string(),
        )],
        dry_run: false,
    };

    ModelSnapshot {
        project,
        project_without_git,
        cache_entries,
        scan_request,
        scan_progress,
        cleanup_request,
        cleanup_result,
    }
}

#[test]
#[ignore = "gera fixtures/model-snapshot.json; roda só com --ignored, sob demanda"]
fn generate_fixture() {
    let value = serde_json::to_string_pretty(&build_snapshot()).expect("serialize snapshot");
    let fixture_path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/model-snapshot.json");
    std::fs::write(&fixture_path, value + "\n").expect("write fixture");
}

#[test]
fn model_snapshot_matches_fixture() {
    let actual = serde_json::to_value(build_snapshot()).expect("serialize snapshot");

    let fixture_path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures/model-snapshot.json");
    let raw = std::fs::read_to_string(&fixture_path)
        .unwrap_or_else(|e| panic!("não deu para ler {}: {e}", fixture_path.display()));
    let expected: serde_json::Value = serde_json::from_str(&raw).expect("parse fixture json");

    assert_eq!(
        actual, expected,
        "model.rs e fixtures/model-snapshot.json divergiram; regenere o fixture e atualize src/types.ts"
    );
}
