//! Catálogo de caches de ferramentas de dev (Xcode, Gradle, npm/pnpm/yarn, CocoaPods,
//! Homebrew, Docker) e como limpá-las com segurança.

use std::path::Path;

use crate::error::AppError;
use crate::model::CacheEntry;

/// Lista as entradas de cache conhecidas presentes no `home` informado.
pub trait CacheCatalog {
    fn list(&self, home: &Path) -> Result<Vec<CacheEntry>, AppError>;
}

pub struct StubCacheCatalog;

impl CacheCatalog for StubCacheCatalog {
    fn list(&self, _home: &Path) -> Result<Vec<CacheEntry>, AppError> {
        todo!("caches: catálogo de caches ainda não implementado")
    }
}
