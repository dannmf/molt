//! Comandos Tauri expostos ao frontend via `invoke()`. A assinatura vista pelo
//! frontend é a documentada em cada função; o `app: AppHandle` é injetado pelo Tauri
//! e não aparece do lado do `invoke()`.
//!
//! Scanner, detectors, caches e cleanup ainda não estão implementados: estes comandos
//! devolvem dados mock para que o frontend e o harness de testes tenham algo real para
//! consumir enquanto as outras partes são construídas em paralelo.

use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Runtime};

use crate::error::AppError;
use crate::model::{
    Artifact, ArtifactKind, CacheEntry, CacheRisk, CleanStrategy, CleanupRequest, CleanupResult,
    GitInfo, Project, ProjectKind, ScanProgress, ScanRequest,
};

/// Varre as raízes pedidas em busca de projetos, emitindo `ScanProgress` no evento
/// `scan://progress` ao longo da varredura.
///
/// Genérico em `R: Runtime` para aceitar tanto o runtime real (`Wry`) quanto o
/// `MockRuntime` usado no teste de fumaça em `tests/commands_smoke.rs`.
#[tauri::command]
pub fn scan_projects<R: Runtime>(
    app: AppHandle<R>,
    req: ScanRequest,
) -> Result<Vec<Project>, AppError> {
    let projects = mock_projects();

    app.emit(
        "scan://progress",
        ScanProgress {
            scanned_dirs: 0,
            projects_found: 0,
            current_path: req
                .roots
                .first()
                .map(|p| p.display().to_string())
                .unwrap_or_default(),
        },
    )
    .map_err(|e| AppError::Other(e.to_string()))?;

    app.emit(
        "scan://progress",
        ScanProgress {
            scanned_dirs: projects.len() as u64,
            projects_found: projects.len() as u64,
            current_path: String::new(),
        },
    )
    .map_err(|e| AppError::Other(e.to_string()))?;

    Ok(projects)
}

/// Lista o catálogo de caches de ferramentas de dev encontradas no HOME do usuário.
#[tauri::command]
pub fn list_caches() -> Result<Vec<CacheEntry>, AppError> {
    Ok(mock_caches())
}

/// Executa (ou simula, se `dry_run`) a limpeza dos alvos pedidos.
#[tauri::command]
pub fn run_cleanup(req: CleanupRequest) -> Result<CleanupResult, AppError> {
    Ok(CleanupResult {
        freed_bytes: 0,
        removed: Vec::new(),
        failed: Vec::new(),
        dry_run: req.dry_run,
    })
}

/// Abre o Finder com `path` selecionado.
#[tauri::command]
pub fn reveal_in_finder(path: PathBuf) -> Result<(), AppError> {
    let _ = path;
    todo!("commands: reveal_in_finder ainda não implementado")
}

fn mock_projects() -> Vec<Project> {
    vec![
        Project {
            id: "mock-molt".to_string(),
            name: "molt".to_string(),
            path: PathBuf::from("/Users/mock/dev/molt"),
            kinds: vec![ProjectKind::Rust, ProjectKind::Node],
            total_bytes: 1_800_000_000,
            reclaimable_bytes: 1_200_000_000,
            artifacts: vec![
                Artifact {
                    path: PathBuf::from("/Users/mock/dev/molt/src-tauri/target"),
                    kind: ArtifactKind::RustTarget,
                    bytes: 900_000_000,
                    regenerate_hint: "cargo build".to_string(),
                },
                Artifact {
                    path: PathBuf::from("/Users/mock/dev/molt/node_modules"),
                    kind: ArtifactKind::NodeModules,
                    bytes: 300_000_000,
                    regenerate_hint: "pnpm install".to_string(),
                },
            ],
            last_modified_at: 1_732_000_000,
            git: Some(GitInfo {
                branch: Some("main".to_string()),
                last_commit_at: Some(1_732_000_000),
                dirty: false,
                unpushed_commits: 0,
                has_remote: true,
            }),
        },
        Project {
            id: "mock-expo-app".to_string(),
            name: "expo-app".to_string(),
            path: PathBuf::from("/Users/mock/dev/expo-app"),
            kinds: vec![ProjectKind::Expo, ProjectKind::ReactNative],
            total_bytes: 650_000_000,
            reclaimable_bytes: 500_000_000,
            artifacts: vec![Artifact {
                path: PathBuf::from("/Users/mock/dev/expo-app/node_modules"),
                kind: ArtifactKind::NodeModules,
                bytes: 500_000_000,
                regenerate_hint: "pnpm install".to_string(),
            }],
            last_modified_at: 1_731_500_000,
            git: Some(GitInfo {
                branch: Some("feat/onboarding".to_string()),
                last_commit_at: Some(1_731_500_000),
                dirty: true,
                unpushed_commits: 3,
                has_remote: true,
            }),
        },
    ]
}

fn mock_caches() -> Vec<CacheEntry> {
    vec![
        CacheEntry {
            id: "npm-cache".to_string(),
            label: "npm cache".to_string(),
            tool: "npm".to_string(),
            paths: vec![PathBuf::from("/Users/mock/.npm/_cacache")],
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
            description: "Cache de pacotes do npm, recriada no próximo install.".to_string(),
        },
        CacheEntry {
            id: "xcode-derived-data".to_string(),
            label: "Xcode DerivedData".to_string(),
            tool: "xcode".to_string(),
            paths: vec![PathBuf::from(
                "/Users/mock/Library/Developer/Xcode/DerivedData",
            )],
            bytes: 8_200_000_000,
            risk: CacheRisk::Rebuildable,
            strategy: CleanStrategy::Trash {
                paths: vec![PathBuf::from(
                    "/Users/mock/Library/Developer/Xcode/DerivedData",
                )],
            },
            description: "Build intermediário do Xcode, recriado no próximo build.".to_string(),
        },
    ]
}
