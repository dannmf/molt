//! Execução segura de limpeza: sempre move para a Lixeira, nunca `remove_dir_all`
//! fora de testes, e respeita `dry_run`/`allow_dirty_git`.

use std::path::Path;

use crate::error::AppError;
use crate::model::{CleanupRequest, CleanupResult};

/// Executa uma `CleanupRequest` contra o `home` informado.
pub trait CleanupExecutor {
    fn execute(&self, home: &Path, request: &CleanupRequest) -> Result<CleanupResult, AppError>;
}

pub struct StubCleanupExecutor;

impl CleanupExecutor for StubCleanupExecutor {
    fn execute(&self, _home: &Path, _request: &CleanupRequest) -> Result<CleanupResult, AppError> {
        todo!("cleanup: execução de limpeza ainda não implementada")
    }
}
