//! Erro único do backend, serializável para que o frontend receba uma mensagem
//! utilizável em vez de um `Debug` genérico do Rust.

use std::path::PathBuf;

use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("caminho não encontrado: {0}")]
    PathNotFound(PathBuf),

    #[error("caminho inválido: {0}")]
    InvalidPath(String),

    #[error("cache desconhecida: {0}")]
    UnknownCache(String),

    #[error("operação de git falhou: {0}")]
    Git(String),

    #[error("erro de I/O em {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("comando externo falhou: {0}")]
    CommandFailed(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<git2::Error> for AppError {
    fn from(err: git2::Error) -> Self {
        AppError::Git(err.message().to_string())
    }
}
