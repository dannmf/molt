//! Comandos Tauri expostos ao frontend via `invoke()`. A assinatura vista pelo
//! frontend é a documentada em cada função; `app`/`state` são injetados pelo
//! Tauri e não aparecem do lado do `invoke()`.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Runtime, State};

use crate::caches;
use crate::cleanup::{self, CleanupContext, CommandExecutor, SystemCommandExecutor};
use crate::detectors::{MoltArtifactDetector, MoltGitDetector, MoltKindDetector};
use crate::docker;
use crate::error::AppError;
use crate::model::{
    CacheEntry, CleanStrategy, CleanupRequest, CleanupResult, DockerSummary, Project, ScanProgress,
    ScanRequest,
};
use crate::scanner::{Detectors, JwalkScanner, Scanner};

/// Estado mantido entre comandos: a lista de caminhos permitidos para limpeza
/// (a única fonte de verdade de `run_cleanup`) vem do último `scan_projects` e
/// do último `list_caches` — nunca de um caminho construído na hora a partir
/// de um `CleanupTarget` recebido do frontend. `last_docker_summary` serve o
/// mesmo papel para `clean_docker_resource`: só se pode limpar um recurso que
/// apareceu no último `list_docker_resources`.
#[derive(Default)]
pub struct AppState {
    pub last_scan_paths: Vec<PathBuf>,
    pub last_caches: Vec<CacheEntry>,
    pub last_docker_summary: Option<DockerSummary>,
}

fn home_dir() -> Result<PathBuf, AppError> {
    dirs::home_dir().ok_or_else(|| AppError::Other("não foi possível localizar o HOME".to_string()))
}

/// Varre as raízes pedidas em busca de projetos, emitindo `ScanProgress` no evento
/// `scan://progress` ao longo da varredura. Roda em `spawn_blocking` porque a
/// varredura (jwalk + rayon, I/O síncrono) bloquearia a UI se rodasse na thread
/// async do Tauri.
///
/// Genérico em `R: Runtime` para aceitar tanto o runtime real (`Wry`) quanto o
/// `MockRuntime` usado no teste de fumaça em `tests/commands_smoke.rs`.
#[tauri::command]
pub async fn scan_projects<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Mutex<AppState>>,
    req: ScanRequest,
) -> Result<Vec<Project>, AppError> {
    let app_for_progress = app.clone();

    let scan_result =
        tauri::async_runtime::spawn_blocking(move || -> Result<Vec<Project>, AppError> {
            let detectors = Detectors {
                kind: &MoltKindDetector,
                artifact: &MoltArtifactDetector,
                git: &MoltGitDetector,
            };
            let mut on_progress = move |progress: ScanProgress| {
                let _ = app_for_progress.emit("scan://progress", progress);
            };
            JwalkScanner.scan(&req, &detectors, &mut on_progress)
        })
        .await;

    let projects = match scan_result {
        Ok(inner) => inner?,
        Err(join_error) => return Err(AppError::Other(join_error.to_string())),
    };

    let mut allowed_paths = Vec::new();
    for project in &projects {
        allowed_paths.push(project.path.clone());
        for artifact in &project.artifacts {
            allowed_paths.push(artifact.path.clone());
        }
    }
    state.lock().unwrap().last_scan_paths = allowed_paths;

    Ok(projects)
}

/// Lista o catálogo de caches de ferramentas de dev encontradas no HOME do usuário.
#[tauri::command]
pub fn list_caches(state: State<'_, Mutex<AppState>>) -> Result<Vec<CacheEntry>, AppError> {
    let home = home_dir()?;
    let entries = caches::list_caches(&home);
    state.lock().unwrap().last_caches = entries.clone();
    Ok(entries)
}

/// Executa (ou simula, se `dry_run`) a limpeza dos alvos pedidos, restrita aos
/// caminhos vistos no último `scan_projects`/`list_caches`.
#[tauri::command]
pub fn run_cleanup(
    state: State<'_, Mutex<AppState>>,
    req: CleanupRequest,
) -> Result<CleanupResult, AppError> {
    let home = home_dir()?;
    let guard = state.lock().unwrap();

    let mut allowed_paths = guard.last_scan_paths.clone();
    for cache in &guard.last_caches {
        allowed_paths.extend(cache.paths.clone());
    }
    let ctx = CleanupContext {
        home,
        allowed_paths,
        caches: guard.last_caches.clone(),
        executor: &SystemCommandExecutor,
    };
    drop(guard);

    Ok(cleanup::run_cleanup(req, &ctx))
}

/// Lista o catálogo de recursos Docker reclamáveis (imagens penduradas, containers
/// parados, volumes órfãos, build cache) e os containers em execução, separado do
/// catálogo de caches de dev. `available = false` quando o binário `docker` não está
/// no `PATH` ou o daemon não responde.
#[tauri::command]
pub fn list_docker_resources(state: State<'_, Mutex<AppState>>) -> Result<DockerSummary, AppError> {
    let summary = docker::docker_summary();
    state.lock().unwrap().last_docker_summary = Some(summary.clone());
    Ok(summary)
}

/// Limpa um único recurso Docker (`id` vindo do último `list_docker_resources`),
/// executando o `CleanStrategy::Command` da entrada correspondente.
#[tauri::command]
pub fn clean_docker_resource(
    state: State<'_, Mutex<AppState>>,
    id: String,
) -> Result<(), AppError> {
    let summary = state
        .lock()
        .unwrap()
        .last_docker_summary
        .clone()
        .ok_or_else(|| AppError::UnknownCache(id.clone()))?;

    let entry = summary
        .dangling_images
        .iter()
        .chain(summary.stopped_containers.iter())
        .chain(summary.orphan_volumes.iter())
        .chain(summary.build_cache.iter())
        .find(|entry| entry.id == id)
        .cloned()
        .ok_or_else(|| AppError::UnknownCache(id.clone()))?;

    match entry.strategy {
        CleanStrategy::Command { program, args } => SystemCommandExecutor
            .execute(&program, &args)
            .map_err(AppError::CommandFailed),
        CleanStrategy::Trash { .. } => Err(AppError::Other(
            "estratégia de limpeza inesperada para recurso Docker".to_string(),
        )),
    }
}

/// Abre o Finder com `path` selecionado (`open -R`, sem shell, binário resolvido no PATH).
#[tauri::command]
pub fn reveal_in_finder(path: PathBuf) -> Result<(), AppError> {
    let status = std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status()
        .map_err(|e| AppError::CommandFailed(format!("não foi possível iniciar 'open': {e}")))?;

    if status.success() {
        Ok(())
    } else {
        Err(AppError::CommandFailed(format!(
            "'open -R' terminou com código {status}"
        )))
    }
}
