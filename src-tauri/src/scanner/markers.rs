//! Arquivos/diretórios que marcam a raiz de um projeto, e a lista default de
//! diretórios que a varredura nunca desce (ver `docs/architecture.md`).

use std::fs;
use std::path::Path;

use jwalk::{ClientState, DirEntry};

/// Nomes de arquivo que, por si só, identificam a raiz de um projeto.
const MARKER_FILES: &[&str] = &[
    "package.json",
    "Cargo.toml",
    "pubspec.yaml",
    "pyproject.toml",
    "requirements.txt",
    "go.mod",
    "build.gradle",
    "build.gradle.kts",
    "Package.swift",
    "pom.xml",
];

/// Sufixo de diretório que identifica um projeto Xcode (o bundle `*.xcodeproj`
/// é, para fins de varredura, o marcador — nunca descemos dentro dele).
const XCODEPROJ_SUFFIX: &str = ".xcodeproj";

/// Diretórios que a varredura nunca desce, independente do `ignore` do request.
/// `node_modules` é um ponto de PARADA (sabemos que existe, não olhamos dentro
/// procurando marcadores), não uma exclusão: ele ainda é medido na fase de tamanho.
pub const DEFAULT_IGNORE: &[&str] = &[".Trash", "Library", ".git", "node_modules"];

/// Verdadeiro se a entrada (arquivo ou diretório) é um marcador de projeto.
pub fn is_marker_entry<C: ClientState>(entry: &DirEntry<C>) -> bool {
    let name = entry.file_name().to_string_lossy();
    if entry.file_type().is_dir() {
        name.ends_with(XCODEPROJ_SUFFIX)
    } else {
        MARKER_FILES.contains(&name.as_ref())
    }
}

/// Verdadeiro se algum marcador de projeto está entre os filhos lidos de um diretório.
pub fn children_have_marker<C: ClientState>(children: &[jwalk::Result<DirEntry<C>>]) -> bool {
    children
        .iter()
        .any(|child| child.as_ref().map(is_marker_entry).unwrap_or(false))
}

/// Mesma checagem de `is_marker_entry`, mas lendo o diretório diretamente do
/// disco em vez de a partir de uma `DirEntry` do jwalk. Usado pela resolução
/// de membros de monorepo (`workspace.rs`), que não passa pelo walker.
pub fn path_has_marker(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    entries.filter_map(Result::ok).any(|entry| {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.ends_with(XCODEPROJ_SUFFIX) {
            true
        } else {
            MARKER_FILES.contains(&name.as_str())
        }
    })
}
