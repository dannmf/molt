//! Detecção e resolução de monorepos: quando a raiz de um projeto declara um
//! workspace (npm/pnpm/Cargo), registramos a raiz *e* os membros como
//! projetos separados, em vez de parar no primeiro marcador encontrado.
//!
//! Não há crate de TOML/YAML nas dependências (ver `docs/contract-requests.md`
//! para a proposta de adicionar `toml`/`serde_yaml`); os parsers abaixo são
//! heurísticos e cobrem o formato comum (array de strings em uma ou várias
//! linhas, sem interpolação/âncoras YAML). Padrões não suportados (ex.: glob
//! `**`) são ignorados silenciosamente em vez de causar erro.

use std::fs;
use std::path::{Path, PathBuf};

use super::markers::path_has_marker;

/// Resolve os membros de um monorepo a partir da raiz já identificada como
/// projeto. Devolve só diretórios que, além de casarem com um padrão do
/// workspace, também têm seu próprio marcador de projeto (evita tratar toda
/// pasta dentro de `packages/` como projeto).
pub fn monorepo_members(root: &Path) -> Vec<PathBuf> {
    let mut patterns = node_workspace_patterns(root);
    patterns.extend(pnpm_workspace_patterns(root));
    patterns.extend(cargo_workspace_patterns(root));

    let mut members: Vec<PathBuf> = patterns
        .iter()
        .flat_map(|pattern| resolve_pattern(root, pattern))
        .filter(|path| path != root && path_has_marker(path))
        .collect();

    members.sort();
    members.dedup();
    members
}

/// `package.json` com campo `"workspaces"`: array de strings, ou objeto
/// `{ "packages": [...] }` (forma usada por Yarn/npm modernos).
fn node_workspace_patterns(root: &Path) -> Vec<String> {
    let Ok(content) = fs::read_to_string(root.join("package.json")) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
        return Vec::new();
    };
    let workspaces = match value.get("workspaces") {
        Some(w) => w,
        None => return Vec::new(),
    };
    let array = workspaces
        .as_array()
        .or_else(|| workspaces.get("packages").and_then(|p| p.as_array()));
    match array {
        Some(array) => array
            .iter()
            .filter_map(|v| v.as_str().map(str::to_string))
            .collect(),
        None => Vec::new(),
    }
}

/// `pnpm-workspace.yaml`: só a forma comum `packages:\n  - 'pattern'`.
fn pnpm_workspace_patterns(root: &Path) -> Vec<String> {
    let Ok(content) = fs::read_to_string(root.join("pnpm-workspace.yaml")) else {
        return Vec::new();
    };

    let mut patterns = Vec::new();
    let mut inside_packages = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("packages:") {
            inside_packages = true;
            continue;
        }
        if inside_packages {
            if let Some(item) = trimmed.strip_prefix("- ") {
                patterns.push(item.trim_matches(['\'', '"']).to_string());
            } else if !trimmed.is_empty() {
                // Linha sem indentação de item: a lista `packages` terminou.
                break;
            }
        }
    }
    patterns
}

/// `Cargo.toml` com `[workspace]` e `members = [...]` (uma ou várias linhas).
fn cargo_workspace_patterns(root: &Path) -> Vec<String> {
    let Ok(content) = fs::read_to_string(root.join("Cargo.toml")) else {
        return Vec::new();
    };
    let Some(workspace_start) = content.find("[workspace]") else {
        return Vec::new();
    };
    let section = &content[workspace_start..];
    let Some(members_start) = section.find("members") else {
        return Vec::new();
    };
    let after_members = &section[members_start..];
    let Some(array_start) = after_members.find('[') else {
        return Vec::new();
    };
    let Some(array_end) = after_members.find(']') else {
        return Vec::new();
    };
    if array_end < array_start {
        return Vec::new();
    }
    let array_body = &after_members[array_start + 1..array_end];
    array_body
        .split(',')
        .filter_map(|entry| {
            let trimmed = entry.trim().trim_matches(['\'', '"']);
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .collect()
}

/// Resolve um único padrão de workspace para diretórios reais sob `root`.
/// Suporta só padrões rasos (`"dir"` exato ou `"dir/*"`); qualquer outra forma
/// de glob (`**`, `dir/*/sub`) é ignorada.
fn resolve_pattern(root: &Path, pattern: &str) -> Vec<PathBuf> {
    if let Some(prefix) = pattern.strip_suffix("/*") {
        let base = root.join(prefix);
        let Ok(entries) = fs::read_dir(&base) else {
            return Vec::new();
        };
        entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .collect()
    } else if pattern.contains('*') {
        // Padrão de glob não suportado (ex.: "**"): ignorado de propósito.
        Vec::new()
    } else {
        let candidate = root.join(pattern);
        if candidate.is_dir() {
            vec![candidate]
        } else {
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_marker(dir: &Path, file: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(file), "{}").unwrap();
    }

    #[test]
    fn resolves_node_workspaces_field() {
        let home = tempdir().unwrap();
        let root = home.path().join("monorepo");
        write_marker(&root, "package.json");
        fs::write(
            root.join("package.json"),
            r#"{"name":"root","workspaces":["packages/*"]}"#,
        )
        .unwrap();
        write_marker(&root.join("packages/a"), "package.json");
        write_marker(&root.join("packages/b"), "package.json");
        // Pasta sem marcador: não deve ser tratada como membro.
        fs::create_dir_all(root.join("packages/not-a-project")).unwrap();

        let mut members = monorepo_members(&root);
        members.sort();
        assert_eq!(
            members,
            vec![root.join("packages/a"), root.join("packages/b")]
        );
    }

    #[test]
    fn resolves_pnpm_workspace_yaml() {
        let home = tempdir().unwrap();
        let root = home.path().join("monorepo");
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("pnpm-workspace.yaml"),
            "packages:\n  - 'apps/*'\n  - 'tools'\n",
        )
        .unwrap();
        write_marker(&root.join("apps/mobile"), "package.json");
        write_marker(&root.join("tools"), "package.json");

        let mut members = monorepo_members(&root);
        members.sort();
        assert_eq!(members, vec![root.join("apps/mobile"), root.join("tools")]);
    }

    #[test]
    fn resolves_cargo_workspace_members() {
        let home = tempdir().unwrap();
        let root = home.path().join("monorepo");
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("Cargo.toml"),
            "[workspace]\nmembers = [\"crates/one\", \"crates/two\"]\n",
        )
        .unwrap();
        write_marker(&root.join("crates/one"), "Cargo.toml");
        write_marker(&root.join("crates/two"), "Cargo.toml");

        let mut members = monorepo_members(&root);
        members.sort();
        assert_eq!(
            members,
            vec![root.join("crates/one"), root.join("crates/two")]
        );
    }

    #[test]
    fn non_monorepo_has_no_members() {
        let home = tempdir().unwrap();
        let root = home.path().join("simple");
        write_marker(&root, "package.json");
        fs::write(root.join("package.json"), r#"{"name":"simple"}"#).unwrap();

        assert!(monorepo_members(&root).is_empty());
    }
}
