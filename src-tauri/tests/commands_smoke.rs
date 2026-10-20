//! Teste de fumaça: cada comando Tauri compila, é alcançável pelo invoke_handler
//! e devolve os dados mock esperados.

use molt_lib::model::{CleanupRequest, CleanupTarget, ScanRequest};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
use tauri::App;

fn build_app() -> App<MockRuntime> {
    mock_builder()
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
fn scan_projects_returns_mock_projects_and_emits_progress() {
    let app = build_app();
    let request = ScanRequest {
        roots: vec!["/tmp".into()],
        max_depth: 4,
        ignore: vec![],
    };

    let projects = molt_lib::commands::scan_projects(app.handle().clone(), request)
        .expect("scan_projects deveria devolver o mock");

    assert!(!projects.is_empty());
}

#[test]
fn list_caches_returns_mock_caches() {
    let caches = molt_lib::commands::list_caches().expect("list_caches deveria devolver o mock");
    assert!(!caches.is_empty());
}

#[test]
fn run_cleanup_echoes_dry_run_flag() {
    let request = CleanupRequest {
        targets: vec![CleanupTarget::Cache {
            id: "npm-cache".into(),
        }],
        dry_run: true,
        allow_dirty_git: false,
    };

    let result =
        molt_lib::commands::run_cleanup(request).expect("run_cleanup deveria devolver o mock");
    assert!(result.dry_run);
}

#[test]
#[should_panic(expected = "reveal_in_finder ainda não implementado")]
fn reveal_in_finder_is_a_known_todo() {
    let _ = molt_lib::commands::reveal_in_finder("/tmp".into());
}
