pub mod caches;
pub mod cleanup;
pub mod commands;
pub mod detectors;
pub mod error;
pub mod model;
pub mod scanner;

#[cfg(any(test, feature = "testkit"))]
pub mod testkit;

use std::sync::Mutex;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(commands::AppState::default()))
        .setup(|app| {
            // Vibrancy nativa da sidebar; falha em silêncio em sistemas sem
            // suporte (ex.: a própria janela já não pede transparência fora
            // do macOS) — não deve impedir o app de abrir.
            #[cfg(target_os = "macos")]
            {
                let window = app
                    .get_webview_window("main")
                    .expect("janela principal 'main' deveria existir");
                let _ = window_vibrancy::apply_vibrancy(
                    &window,
                    window_vibrancy::NSVisualEffectMaterial::Sidebar,
                    None,
                    None,
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_projects,
            commands::list_caches,
            commands::run_cleanup,
            commands::cleanup_history,
            commands::reveal_in_finder,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Molt");
}
