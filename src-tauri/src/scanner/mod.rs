//! Varredura de disco: encontra projetos sob as raízes pedidas e mede seu tamanho.
//!
//! Regras de medição (ver docs/architecture.md):
//! - Tamanho = blocos alocados (`st_blocks * 512`), nunca `st_size`.
//! - Hardlinks são deduplicados por `(dev, ino)` dentro de uma mesma varredura.
//! - Symlinks nunca são seguidos.

use std::path::Path;

use crate::error::AppError;
use crate::model::{Project, ScanProgress, ScanRequest};

/// Implementado pelo scanner real; permite trocar a implementação em testes.
pub trait Scanner {
    fn scan(
        &self,
        home: &Path,
        request: &ScanRequest,
        on_progress: &mut dyn FnMut(ScanProgress),
    ) -> Result<Vec<Project>, AppError>;
}

/// Scanner ainda não implementado. Qualquer chamada real deve passar por aqui.
pub struct StubScanner;

impl Scanner for StubScanner {
    fn scan(
        &self,
        _home: &Path,
        _request: &ScanRequest,
        _on_progress: &mut dyn FnMut(ScanProgress),
    ) -> Result<Vec<Project>, AppError> {
        todo!("scanner: varredura de disco ainda não implementada")
    }
}
