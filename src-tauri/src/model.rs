//! Tipos compartilhados entre o backend Rust e o frontend TypeScript.
//!
//! Espelho exato em `src/types.ts`. Qualquer mudança aqui exige a mesma mudança lá
//! (veja o teste de snapshot em `commands.rs` e em `src/api/__tests__`).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Stack identificada em um projeto. Um projeto pode ter mais de um kind
/// (ex.: um monorepo Node com um backend Rust).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectKind {
    Node,
    Rust,
    Python,
    Flutter,
    ReactNative,
    Expo,
    Swift,
    Android,
    Go,
    Java,
    Unknown,
}

/// Tipo de artefato regenerável encontrado dentro de um projeto.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ArtifactKind {
    NodeModules,
    NextBuild,
    RustTarget,
    PythonVenv,
    PythonCache,
    FlutterBuild,
    DartTool,
    Pods,
    AndroidBuild,
    GradleProject,
    XcodeBuild,
    Dist,
    Other(String),
}

/// Um artefato regenerável (ex.: node_modules) dentro de um projeto.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub path: PathBuf,
    pub kind: ArtifactKind,
    pub bytes: u64,
    /// Texto curto explicando como o artefato é recriado (ex.: "pnpm install").
    pub regenerate_hint: String,
}

/// Estado git de um projeto, quando aplicável.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub branch: Option<String>,
    /// Timestamp unix (segundos) do último commit.
    pub last_commit_at: Option<i64>,
    pub dirty: bool,
    pub unpushed_commits: u32,
    pub has_remote: bool,
}

/// Um projeto de código encontrado no disco.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// Hash estável do path, usado como identidade no frontend.
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub kinds: Vec<ProjectKind>,
    pub total_bytes: u64,
    pub reclaimable_bytes: u64,
    pub artifacts: Vec<Artifact>,
    /// Timestamp unix (segundos) da modificação mais recente no projeto.
    pub last_modified_at: i64,
    pub git: Option<GitInfo>,
}

/// Nível de risco de limpar uma entrada de cache.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CacheRisk {
    Safe,
    Rebuildable,
    Caution,
}

/// Como uma entrada de cache deve ser limpa.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum CleanStrategy {
    Trash { paths: Vec<PathBuf> },
    Command { program: String, args: Vec<String> },
}

/// Uma entrada no catálogo de caches de ferramentas de dev.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub id: String,
    pub label: String,
    pub tool: String,
    pub paths: Vec<PathBuf>,
    pub bytes: u64,
    pub risk: CacheRisk,
    pub strategy: CleanStrategy,
    pub description: String,
}

/// Parâmetros de uma varredura de disco.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRequest {
    pub roots: Vec<PathBuf>,
    pub max_depth: u32,
    pub ignore: Vec<String>,
    /// Caminhos de projeto a nunca registrar (exclusão persistente escolhida pelo
    /// usuário). Um caminho aqui também para a varredura de descer para dentro dele.
    pub excluded_paths: Vec<PathBuf>,
}

/// Evento de progresso emitido durante uma varredura (canal `scan://progress`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub scanned_dirs: u64,
    pub projects_found: u64,
    pub current_path: String,
}

/// Um alvo de limpeza: um artefato específico, um projeto inteiro ou uma cache.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum CleanupTarget {
    Artifact { path: PathBuf },
    Project { path: PathBuf },
    Cache { id: String },
}

/// Parâmetros de uma operação de limpeza.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRequest {
    pub targets: Vec<CleanupTarget>,
    pub dry_run: bool,
    pub allow_dirty_git: bool,
}

/// Resultado de uma operação de limpeza.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub freed_bytes: u64,
    pub removed: Vec<PathBuf>,
    pub failed: Vec<(PathBuf, String)>,
    pub dry_run: bool,
}
