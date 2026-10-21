//! Teste de fumaça: cada comando Tauri compila, é alcançável pelo invoke_handler
//! e devolve dados reais (contra fixtures do testkit, não mocks).

use std::sync::Mutex;

use molt_lib::commands::AppState;
use molt_lib::model::{CleanupRequest, CleanupTarget, ScanRequest};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
use tauri::{App, Manager};

fn build_app() -> App<MockRuntime> {
    mock_builder()
        .manage(Mutex::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            molt_lib::commands::scan_projects,
            molt_lib::commands::list_caches,
            molt_lib::commands::run_cleanup,
            molt_lib::commands::reveal_in_finder,
        ])
        .build(mock_context(noop_assets()))
        .expect("falha ao construir app mock")
}

#[test]
fn scan_projects_finds_fixture_project_and_tracks_allowed_paths() {
    let home = tempfile::tempdir().unwrap();
    molt_lib::testkit::fixture_node_project(home.path(), "app", 1).unwrap();

    let app = build_app();
    let state = app.state::<Mutex<AppState>>();
    let request = ScanRequest {
        roots: vec![home.path().to_path_buf()],
        max_depth: 6,
        ignore: vec![],
        excluded_paths: vec![],
    };

    let projects = tauri::async_runtime::block_on(molt_lib::commands::scan_projects(
        app.handle().clone(),
        state,
        request,
    ))
    .expect("scan_projects deveria varrer a fixture");

    assert_eq!(projects.len(), 1);
    assert!(!app
        .state::<Mutex<AppState>>()
        .lock()
        .unwrap()
        .last_scan_paths
        .is_empty());
}

#[test]
fn list_caches_returns_real_catalog() {
    let app = build_app();
    let state = app.state::<Mutex<AppState>>();

    let caches = molt_lib::commands::list_caches(state).expect("list_caches deveria funcionar");
    assert!(!caches.is_empty());
}

#[test]
fn run_cleanup_rejects_target_outside_allowed_paths() {
    let app = build_app();
    let state = app.state::<Mutex<AppState>>();

    let request = CleanupRequest {
        targets: vec![CleanupTarget::Cache {
            id: "npm-cache".into(),
        }],
        dry_run: true,
        allow_dirty_git: false,
    };

    // Sem list_caches/scan_projects antes, "npm-cache" não está na lista
    // permitida: run_cleanup deve recusar o alvo, não lançar um erro.
    let result = molt_lib::commands::run_cleanup(state, request).expect("run_cleanup é infalível");
    assert!(result.dry_run);
    assert!(result.freed_bytes == 0);
}

#[test]
fn reveal_in_finder_opens_without_panicking() {
    let result = molt_lib::commands::reveal_in_finder("/tmp".into());
    assert!(result.is_ok());
}
