//! Detecção de stack, artefatos regeneráveis e estado git de um projeto.

use std::path::Path;

use crate::error::AppError;
use crate::model::{Artifact, GitInfo, ProjectKind};

/// Identifica as stacks presentes em um diretório de projeto.
pub trait KindDetector {
    fn detect(&self, project_root: &Path) -> Vec<ProjectKind>;
}

/// Encontra artefatos regeneráveis (node_modules, target/, Pods...) dentro de um projeto.
pub trait ArtifactDetector {
    fn detect(&self, project_root: &Path, kinds: &[ProjectKind]) -> Vec<Artifact>;
}

/// Lê o estado git de um projeto (branch, dirty, commits não enviados).
pub trait GitDetector {
    fn detect(&self, project_root: &Path) -> Result<Option<GitInfo>, AppError>;
}

pub struct StubKindDetector;

impl KindDetector for StubKindDetector {
    fn detect(&self, _project_root: &Path) -> Vec<ProjectKind> {
        todo!("detectors: detecção de stack ainda não implementada")
    }
}

pub struct StubArtifactDetector;

impl ArtifactDetector for StubArtifactDetector {
    fn detect(&self, _project_root: &Path, _kinds: &[ProjectKind]) -> Vec<Artifact> {
        todo!("detectors: detecção de artefatos ainda não implementada")
    }
}

pub struct StubGitDetector;

impl GitDetector for StubGitDetector {
    fn detect(&self, _project_root: &Path) -> Result<Option<GitInfo>, AppError> {
        todo!("detectors: detecção de git ainda não implementada")
    }
}
