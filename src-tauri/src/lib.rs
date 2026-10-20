pub mod caches;
pub mod cleanup;
pub mod commands;
pub mod detectors;
pub mod error;
pub mod model;
pub mod scanner;

#[cfg(any(test, feature = "testkit"))]
pub mod testkit;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::scan_projects,
            commands::list_caches,
            commands::run_cleanup,
            commands::reveal_in_finder,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Molt");
}
