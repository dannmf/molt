//! Execução segura de limpeza: sempre move para a Lixeira (`trash`), nunca
//! `remove_dir_all` fora de testes, e respeita `dry_run`/`allow_dirty_git`.
//!
//! `run_cleanup` é infalível (devolve `CleanupResult`, não `Result`): a falha
//! de um alvo específico vai para `CleanupResult.failed` com uma mensagem
//! legível, sem abortar os demais alvos da requisição.

use std::cell::RefCell;
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::detectors::{GitDetector, MoltGitDetector};
use crate::model::{CacheEntry, CleanStrategy, CleanupRequest, CleanupResult, CleanupTarget};

/// Caminhos fixos que nunca podem ser alvo de limpeza, além do próprio HOME e
/// de qualquer ancestral dele (ver `is_protected`).
const PROTECTED_PATHS: &[&str] = &["/", "/System", "/Applications", "/Library", "/Users"];

/// Serializa todo acesso à Lixeira real do macOS dentro deste processo.
/// Chamadas concorrentes a `trash::delete` (ex.: vários testes rodando em
/// paralelo) engasgam e passam a falhar sob contenção — confirmado
/// empiricamente (um teste isolado passa em <1s; o mesmo teste junto de
/// outros que também usam a Lixeira falhou e levou mais de 1 minuto). Isso
/// não é específico de teste: qualquer chamador real que dispare limpezas
/// concorrentes teria o mesmo problema.
static TRASH_LOCK: Mutex<()> = Mutex::new(());

fn trash_delete(path: &Path) -> Result<(), trash::Error> {
    let _guard = TRASH_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    trash::delete(path)
}

/// Timeout fixo para os comandos de `CleanStrategy::Command` (ex.: `npm cache
/// clean --force`). Mesmo valor usado por `caches::system`, mas essa lógica
/// não pode ser reaproveitada daqui: `caches::system` é um módulo privado a
/// `caches/` (ver `docs/contract-requests.md`).
const COMMAND_TIMEOUT: Duration = Duration::from_secs(5);

/// Executa comandos externos de `CleanStrategy::Command`. Injetável para que
/// os testes verifiquem o programa/argumentos exatos sem rodar um processo
/// real.
pub trait CommandExecutor {
    fn execute(&self, program: &str, args: &[String]) -> Result<(), String>;
}

/// Implementação real: resolve `program` no `PATH` (sem shell) e roda com um
/// timeout fixo, igual à regra de `AGENTS.md` ("Comandos externos: sem shell,
/// com timeout, binário resolvido no PATH").
#[derive(Default)]
pub struct SystemCommandExecutor;

impl CommandExecutor for SystemCommandExecutor {
    fn execute(&self, program: &str, args: &[String]) -> Result<(), String> {
        let resolved = resolve_binary(program)
            .ok_or_else(|| format!("binário '{program}' não encontrado no PATH"))?;
        let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
        run_with_timeout(&resolved, &args_ref, COMMAND_TIMEOUT)
    }
}

fn resolve_binary(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var)
        .map(|dir| dir.join(name))
        .find(|candidate| is_executable_file(candidate))
}

fn is_executable_file(path: &Path) -> bool {
    match fs::metadata(path) {
        Ok(meta) => meta.is_file() && meta.permissions().mode() & 0o111 != 0,
        Err(_) => false,
    }
}

/// Roda `program` sem shell, matando o processo se ele exceder `timeout`.
/// Não precisa capturar stdout (ao contrário de `caches::system`): só importa
/// se o comando terminou com sucesso.
fn run_with_timeout(program: &Path, args: &[&str], timeout: Duration) -> Result<(), String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("não foi possível iniciar o comando: {e}"))?;

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err(format!("comando terminou com código {status}"))
                };
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("comando excedeu o tempo limite".to_string());
                }
                thread::sleep(Duration::from_millis(20));
            }
            Err(e) => return Err(format!("falha ao esperar o comando: {e}")),
        }
    }
}

/// Soma de blocos alocados (`st_blocks * 512`) sob um caminho, sem seguir
/// symlinks e deduplicando hardlinks por `(dev, ino)` dentro de uma mesma
/// `run_cleanup`. Mesma regra de `docs/architecture.md`, replicada (não
/// reaproveitada) porque `scanner::size` é privado a `scanner/`.
struct SizeDedup {
    seen: RefCell<HashSet<(u64, u64)>>,
}

impl SizeDedup {
    fn new() -> Self {
        Self {
            seen: RefCell::new(HashSet::new()),
        }
    }

    fn disk_usage_bytes(&self, path: &Path) -> std::io::Result<u64> {
        let mut total = 0u64;
        self.walk(path, &mut total)?;
        Ok(total)
    }

    fn walk(&self, path: &Path, total: &mut u64) -> std::io::Result<()> {
        let meta = fs::symlink_metadata(path)?;
        if meta.file_type().is_symlink() {
            return Ok(());
        }
        if !self.seen.borrow_mut().insert((meta.dev(), meta.ino())) {
            return Ok(());
        }
        *total += meta.blocks() * 512;
        if meta.is_dir() {
            let entries = match fs::read_dir(path) {
                Ok(entries) => entries,
                Err(_) => return Ok(()),
            };
            for entry in entries {
                let entry = match entry {
                    Ok(entry) => entry,
                    Err(_) => continue,
                };
                let _ = self.walk(&entry.path(), total);
            }
        }
        Ok(())
    }
}

/// Contexto de uma execução de limpeza.
///
/// `allowed_paths` é a única fonte de verdade de onde um alvo pode ser
/// apagado: a união dos caminhos que uma varredura (`scan_projects`) e o
/// catálogo (`list_caches`) realmente devolveram — nunca um caminho
/// construído na hora a partir de um `CleanupTarget`. `caches` é o catálogo
/// usado para resolver `CleanupTarget::Cache { id }` na sua `CleanStrategy`
/// (o tipo `CleanupTarget::Cache` só carrega um `id`, sem a estratégia).
pub struct CleanupContext<'a> {
    pub home: PathBuf,
    pub allowed_paths: Vec<PathBuf>,
    pub caches: Vec<CacheEntry>,
    pub executor: &'a dyn CommandExecutor,
}

/// Executa (ou simula, se `request.dry_run`) a limpeza dos alvos pedidos
/// contra `ctx`. Nunca retorna erro: a falha de um alvo vai para
/// `CleanupResult.failed`, sem abortar os demais.
pub fn run_cleanup(request: CleanupRequest, ctx: &CleanupContext) -> CleanupResult {
    let dedup = SizeDedup::new();
    let mut freed_bytes = 0u64;
    let mut removed = Vec::new();
    let mut failed = Vec::new();

    for target in &request.targets {
        match clean_one(target, &request, ctx, &dedup) {
            Ok(outcome) => {
                log_append(ctx, &outcome.summary);
                freed_bytes += outcome.bytes;
                removed.extend(outcome.removed_paths);
            }
            Err((marker, message)) => {
                log_append(ctx, &format!("falha {}: {message}", marker.display()));
                failed.push((marker, message));
            }
        }
    }

    CleanupResult {
        freed_bytes,
        removed,
        failed,
        dry_run: request.dry_run,
    }
}

struct CleanOutcome {
    bytes: u64,
    removed_paths: Vec<PathBuf>,
    summary: String,
}

fn clean_one(
    target: &CleanupTarget,
    request: &CleanupRequest,
    ctx: &CleanupContext,
    dedup: &SizeDedup,
) -> Result<CleanOutcome, (PathBuf, String)> {
    match target {
        CleanupTarget::Artifact { path } => {
            validate_path(path, ctx).map_err(|msg| (path.clone(), msg))?;
            clean_fs_target(path, request.dry_run, dedup)
        }
        CleanupTarget::Project { path } => {
            validate_path(path, ctx).map_err(|msg| (path.clone(), msg))?;
            if !request.allow_dirty_git {
                if let Some(git) = MoltGitDetector
                    .detect(path)
                    .map_err(|e| (path.clone(), e.to_string()))?
                {
                    if git.dirty || git.unpushed_commits > 0 {
                        return Err((
                            path.clone(),
                            "projeto tem mudanças não commitadas ou commits não enviados; \
                             use allowDirtyGit para forçar"
                                .to_string(),
                        ));
                    }
                }
            }
            clean_fs_target(path, request.dry_run, dedup)
        }
        CleanupTarget::Cache { id } => clean_cache_target(id, request.dry_run, ctx, dedup),
    }
}

fn clean_fs_target(
    path: &Path,
    dry_run: bool,
    dedup: &SizeDedup,
) -> Result<CleanOutcome, (PathBuf, String)> {
    let bytes = dedup.disk_usage_bytes(path).map_err(|e| {
        (
            path.to_path_buf(),
            format!("não foi possível medir o tamanho: {e}"),
        )
    })?;
    if !dry_run {
        trash_delete(path).map_err(|e| {
            (
                path.to_path_buf(),
                format!("falha ao mover para a lixeira: {e}"),
            )
        })?;
    }
    let summary = format!(
        "{} {} (~{bytes} bytes)",
        if dry_run { "dry-run" } else { "removido" },
        path.display()
    );
    Ok(CleanOutcome {
        bytes,
        removed_paths: vec![path.to_path_buf()],
        summary,
    })
}

fn clean_cache_target(
    id: &str,
    dry_run: bool,
    ctx: &CleanupContext,
    dedup: &SizeDedup,
) -> Result<CleanOutcome, (PathBuf, String)> {
    let marker = PathBuf::from(format!("cache:{id}"));
    let entry = ctx
        .caches
        .iter()
        .find(|c| c.id == id)
        .ok_or_else(|| (marker.clone(), format!("cache desconhecida: {id}")))?;

    match &entry.strategy {
        CleanStrategy::Trash { paths } => {
            for path in paths {
                validate_path(path, ctx).map_err(|msg| (path.clone(), msg))?;
            }
            let mut bytes = 0u64;
            for path in paths {
                bytes += dedup.disk_usage_bytes(path).map_err(|e| {
                    (
                        path.clone(),
                        format!("não foi possível medir o tamanho: {e}"),
                    )
                })?;
            }
            if !dry_run {
                for path in paths {
                    trash_delete(path).map_err(|e| {
                        (path.clone(), format!("falha ao mover para a lixeira: {e}"))
                    })?;
                }
            }
            let summary = format!(
                "{} cache '{id}' ({} caminho(s), ~{bytes} bytes)",
                if dry_run { "dry-run" } else { "removido" },
                paths.len()
            );
            Ok(CleanOutcome {
                bytes,
                removed_paths: paths.clone(),
                summary,
            })
        }
        CleanStrategy::Command { program, args } => {
            if !dry_run {
                ctx.executor
                    .execute(program, args)
                    .map_err(|msg| (marker.clone(), msg))?;
            }
            let summary = format!(
                "{} cache '{id}' via comando '{program}' (~{} bytes estimados)",
                if dry_run { "dry-run" } else { "executado" },
                entry.bytes
            );
            Ok(CleanOutcome {
                bytes: entry.bytes,
                removed_paths: Vec::new(),
                summary,
            })
        }
    }
}

/// Recusa qualquer caminho que não esteja na lista de permitidos do
/// contexto, que seja um caminho protegido (sistema, HOME ou ancestral do
/// HOME) ou que seja (ou resolva para, via symlink) outro lugar.
fn validate_path(path: &Path, ctx: &CleanupContext) -> Result<(), String> {
    if !ctx.allowed_paths.iter().any(|allowed| allowed == path) {
        return Err("caminho não está na lista de locais permitidos para limpeza".to_string());
    }
    if is_protected(path, &ctx.home) {
        return Err("caminho protegido do sistema ou do HOME não pode ser limpo".to_string());
    }
    if is_symlink_or_resolves_elsewhere(path, &ctx.home) {
        return Err("caminho é (ou passa por) um symlink e não pode ser limpo".to_string());
    }
    Ok(())
}

fn is_protected(path: &Path, home: &Path) -> bool {
    if PROTECTED_PATHS.iter().any(|p| path == Path::new(p)) {
        return true;
    }
    if path == home {
        return true;
    }
    // Qualquer ancestral estrito do HOME (ex.: HOME = /Users/daniel/sub,
    // ancestrais = /Users/daniel, /Users, /).
    home.ancestors().skip(1).any(|ancestor| ancestor == path)
}

/// `true` se o próprio `path` for um symlink, ou se resolver (via
/// `canonicalize`) para um lugar diferente do esperado *dentro da árvore do
/// HOME*. A comparação é feita relativa ao HOME canonicalizado (não ao
/// caminho absoluto bruto) porque no macOS o próprio prefixo do diretório
/// temporário já passa por um symlink (`/var` -> `/private/var`); comparar
/// direto geraria falso positivo para qualquer caminho de teste/HOME que more
/// sob `/tmp` ou `/var`, mesmo sem nenhum symlink dentro da árvore do projeto.
fn is_symlink_or_resolves_elsewhere(path: &Path, home: &Path) -> bool {
    if let Ok(meta) = fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() {
            return true;
        }
    }
    let canon_path = match fs::canonicalize(path) {
        Ok(p) => p,
        Err(_) => return false,
    };
    match (path.strip_prefix(home), fs::canonicalize(home)) {
        (Ok(rel), Ok(canon_home)) => canon_path != canon_home.join(rel),
        _ => canon_path != path,
    }
}

/// Log append-only de toda ação (sucesso ou falha) em
/// `<home>/Library/Logs/Molt/cleanup.log`. Falhas ao escrever o log não
/// interrompem a limpeza em si (o log é observabilidade, não uma garantia de
/// segurança).
fn log_append(ctx: &CleanupContext, line: &str) {
    let log_path = ctx.home.join("Library/Logs/Molt/cleanup.log");
    if let Some(parent) = log_path.parent() {
        if fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(file, "{ts} {line}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    use tempfile::tempdir;

    #[derive(Default)]
    struct FakeExecutor {
        calls: RefCell<Vec<(String, Vec<String>)>>,
        fail: bool,
    }

    impl CommandExecutor for FakeExecutor {
        fn execute(&self, program: &str, args: &[String]) -> Result<(), String> {
            self.calls
                .borrow_mut()
                .push((program.to_string(), args.to_vec()));
            if self.fail {
                Err("comando falhou (fake)".to_string())
            } else {
                Ok(())
            }
        }
    }

    fn sparse_file(path: &Path, bytes: u64) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let file = fs::File::create(path).unwrap();
        file.set_len(bytes).unwrap();
        // `set_len` sozinho não aloca blocos em alguns filesystems; escreve
        // conteúdo de verdade em pedaços para garantir `st_blocks > 0`.
        let mut f = fs::OpenOptions::new().write(true).open(path).unwrap();
        let chunk = vec![0u8; 4096];
        let mut written = 0u64;
        while written < bytes {
            let n = chunk.len().min((bytes - written) as usize);
            f.write_all(&chunk[..n]).unwrap();
            written += n as u64;
        }
    }

    fn ctx<'a>(
        home: &Path,
        allowed_paths: Vec<PathBuf>,
        executor: &'a dyn CommandExecutor,
    ) -> CleanupContext<'a> {
        CleanupContext {
            home: home.to_path_buf(),
            allowed_paths,
            caches: Vec::new(),
            executor,
        }
    }

    fn artifact_request(path: &Path, dry_run: bool) -> CleanupRequest {
        CleanupRequest {
            targets: vec![CleanupTarget::Artifact {
                path: path.to_path_buf(),
            }],
            dry_run,
            allow_dirty_git: false,
        }
    }

    #[test]
    fn rejects_path_outside_allowed_list() {
        let home = tempdir().unwrap();
        let target = home.path().join("node_modules");
        sparse_file(&target.join("f"), 4096);

        let executor = FakeExecutor::default();
        // Lista de permitidos vazia: o caminho acima não está nela.
        let c = ctx(home.path(), Vec::new(), &executor);
        let result = run_cleanup(artifact_request(&target, false), &c);

        assert_eq!(result.failed.len(), 1);
        assert!(result.removed.is_empty());
        assert_eq!(result.freed_bytes, 0);
        assert!(target.exists());
    }

    #[test]
    fn rejects_fixed_protected_paths() {
        let home = tempdir().unwrap();
        let executor = FakeExecutor::default();

        for raw in PROTECTED_PATHS {
            let path = PathBuf::from(raw);
            let c = ctx(home.path(), vec![path.clone()], &executor);
            let result = run_cleanup(artifact_request(&path, false), &c);
            assert_eq!(result.failed.len(), 1, "esperava recusa para {raw}");
            assert!(result.removed.is_empty());
        }
    }

    #[test]
    fn rejects_home_itself() {
        let home = tempdir().unwrap();
        let executor = FakeExecutor::default();
        let c = ctx(home.path(), vec![home.path().to_path_buf()], &executor);
        let result = run_cleanup(artifact_request(home.path(), false), &c);

        assert_eq!(result.failed.len(), 1);
        assert!(home.path().exists());
    }

    #[test]
    fn rejects_ancestor_of_home() {
        let home = tempdir().unwrap();
        let ancestor = home.path().parent().unwrap().to_path_buf();
        let executor = FakeExecutor::default();
        let c = ctx(home.path(), vec![ancestor.clone()], &executor);
        let result = run_cleanup(artifact_request(&ancestor, false), &c);

        assert_eq!(result.failed.len(), 1);
    }

    #[test]
    fn rejects_symlink_target() {
        let home = tempdir().unwrap();
        let real_dir = home.path().join("real-cache");
        sparse_file(&real_dir.join("f"), 4096);
        let link = home.path().join("link-to-cache");
        symlink(&real_dir, &link).unwrap();

        let executor = FakeExecutor::default();
        let c = ctx(home.path(), vec![link.clone()], &executor);
        let result = run_cleanup(artifact_request(&link, false), &c);

        assert_eq!(result.failed.len(), 1);
        assert!(real_dir.exists());
        assert!(link.exists());
    }

    #[test]
    fn rejects_dirty_project_without_allow_dirty_git() {
        let home = tempdir().unwrap();
        let root = crate::testkit::fixture_git_dirty_repo(home.path(), "repo").unwrap();

        let executor = FakeExecutor::default();
        let c = ctx(home.path(), vec![root.clone()], &executor);
        let request = CleanupRequest {
            targets: vec![CleanupTarget::Project { path: root.clone() }],
            dry_run: true,
            allow_dirty_git: false,
        };
        let result = run_cleanup(request, &c);

        assert_eq!(result.failed.len(), 1);
        assert!(result.removed.is_empty());
    }

    #[test]
    fn allows_dirty_project_when_allow_dirty_git_is_set() {
        let home = tempdir().unwrap();
        let root = crate::testkit::fixture_git_dirty_repo(home.path(), "repo").unwrap();

        let executor = FakeExecutor::default();
        let c = ctx(home.path(), vec![root.clone()], &executor);
        let request = CleanupRequest {
            targets: vec![CleanupTarget::Project { path: root.clone() }],
            dry_run: true,
            allow_dirty_git: true,
        };
        let result = run_cleanup(request, &c);

        assert!(result.failed.is_empty());
        assert_eq!(result.removed, vec![root]);
    }

    #[test]
    fn rejects_project_with_unpushed_commits() {
        let home = tempdir().unwrap();
        let remote_root = home.path().join("remote.git");
        git2::Repository::init_bare(&remote_root).unwrap();

        let root = home.path().join("repo");
        fs::create_dir_all(&root).unwrap();
        let repo = git2::Repository::init(&root).unwrap();
        fs::write(root.join("README.md"), "# fixture\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("README.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let signature = git2::Signature::now("Molt Fixture", "fixture@molt.test").unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            "initial commit",
            &tree,
            &[],
        )
        .unwrap();
        let branch_name = repo.head().unwrap().shorthand().unwrap().to_string();

        {
            let mut remote = repo
                .remote("origin", remote_root.to_str().unwrap())
                .unwrap();
            remote
                .push(
                    &[format!("refs/heads/{branch_name}:refs/heads/{branch_name}")],
                    None,
                )
                .unwrap();
        }
        let first_commit_oid = repo.head().unwrap().target().unwrap();
        repo.reference(
            &format!("refs/remotes/origin/{branch_name}"),
            first_commit_oid,
            true,
            "setup do teste",
        )
        .unwrap();
        let mut config = repo.config().unwrap();
        config
            .set_str(&format!("branch.{branch_name}.remote"), "origin")
            .unwrap();
        config
            .set_str(
                &format!("branch.{branch_name}.merge"),
                &format!("refs/heads/{branch_name}"),
            )
            .unwrap();

        // Novo commit local, não enviado ao remoto.
        fs::write(root.join("README.md"), "# fixture\n\nmudança\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("README.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            "second commit",
            &tree,
            &[&parent],
        )
        .unwrap();

        let info = crate::detectors::git_info(&root).unwrap();
        assert!(!info.dirty);
        assert!(info.unpushed_commits > 0);

        let executor = FakeExecutor::default();
        let c = ctx(home.path(), vec![root.clone()], &executor);
        let request = CleanupRequest {
            targets: vec![CleanupTarget::Project { path: root.clone() }],
            dry_run: true,
            allow_dirty_git: false,
        };
        let result = run_cleanup(request, &c);

        assert_eq!(result.failed.len(), 1);
    }

    #[test]
    fn dry_run_does_not_touch_disk() {
        let home = tempdir().unwrap();
        let target = home.path().join("node_modules");
        sparse_file(&target.join("f"), 4096 * 10);

        let executor = FakeExecutor::default();
        let c = ctx(home.path(), vec![target.clone()], &executor);
        let result = run_cleanup(artifact_request(&target, true), &c);

        assert!(result.dry_run);
        assert!(result.failed.is_empty());
        assert_eq!(result.removed, vec![target.clone()]);
        assert!(result.freed_bytes > 0);
        assert!(target.exists());
    }

    #[test]
    fn real_run_moves_artifact_to_trash() {
        let home = tempdir().unwrap();
        let target = home.path().join("node_modules");
        sparse_file(&target.join("f"), 4096 * 10);

        let executor = FakeExecutor::default();
        let c = ctx(home.path(), vec![target.clone()], &executor);
        let result = run_cleanup(artifact_request(&target, false), &c);

        assert!(result.failed.is_empty(), "failed: {:?}", result.failed);
        assert_eq!(result.removed, vec![target.clone()]);
        assert!(result.freed_bytes > 0);
        assert!(fs::symlink_metadata(&target).is_err());
    }

    #[test]
    fn partial_failure_does_not_abort_other_targets() {
        let home = tempdir().unwrap();
        let good = home.path().join("node_modules");
        sparse_file(&good.join("f"), 4096 * 5);
        let missing = home.path().join("already-gone");

        let executor = FakeExecutor::default();
        let c = ctx(home.path(), vec![good.clone(), missing.clone()], &executor);
        let request = CleanupRequest {
            targets: vec![
                CleanupTarget::Artifact { path: good.clone() },
                CleanupTarget::Artifact {
                    path: missing.clone(),
                },
            ],
            dry_run: false,
            allow_dirty_git: false,
        };
        let result = run_cleanup(request, &c);

        assert_eq!(result.removed, vec![good.clone()]);
        assert_eq!(result.failed.len(), 1);
        assert_eq!(result.failed[0].0, missing);
        assert!(fs::symlink_metadata(&good).is_err());
    }

    #[test]
    fn cache_trash_strategy_resolves_entry_and_deletes() {
        let home = tempdir().unwrap();
        let cache_path = home.path().join("Library/Caches/npm/_cacache");
        sparse_file(&cache_path.join("f"), 4096 * 5);

        let entry = CacheEntry {
            id: "npm-cache".to_string(),
            label: "npm cache".to_string(),
            tool: "npm".to_string(),
            paths: vec![cache_path.clone()],
            bytes: 0,
            risk: crate::model::CacheRisk::Safe,
            strategy: CleanStrategy::Trash {
                paths: vec![cache_path.clone()],
            },
            description: String::new(),
        };

        let executor = FakeExecutor::default();
        let c = CleanupContext {
            home: home.path().to_path_buf(),
            allowed_paths: vec![cache_path.clone()],
            caches: vec![entry],
            executor: &executor,
        };
        let request = CleanupRequest {
            targets: vec![CleanupTarget::Cache {
                id: "npm-cache".to_string(),
            }],
            dry_run: false,
            allow_dirty_git: false,
        };
        let result = run_cleanup(request, &c);

        assert!(result.failed.is_empty(), "failed: {:?}", result.failed);
        assert_eq!(result.removed, vec![cache_path.clone()]);
        assert!(result.freed_bytes > 0);
        assert!(fs::symlink_metadata(&cache_path).is_err());
    }

    #[test]
    fn cache_command_strategy_runs_through_injected_executor_with_right_args() {
        let home = tempdir().unwrap();
        let entry = CacheEntry {
            id: "npm-cache".to_string(),
            label: "npm cache".to_string(),
            tool: "npm".to_string(),
            paths: vec![],
            bytes: 1_400_000_000,
            risk: crate::model::CacheRisk::Safe,
            strategy: CleanStrategy::Command {
                program: "npm".to_string(),
                args: vec![
                    "cache".to_string(),
                    "clean".to_string(),
                    "--force".to_string(),
                ],
            },
            description: String::new(),
        };

        let executor = FakeExecutor::default();
        let c = CleanupContext {
            home: home.path().to_path_buf(),
            allowed_paths: vec![],
            caches: vec![entry],
            executor: &executor,
        };
        let request = CleanupRequest {
            targets: vec![CleanupTarget::Cache {
                id: "npm-cache".to_string(),
            }],
            dry_run: false,
            allow_dirty_git: false,
        };
        let result = run_cleanup(request, &c);

        assert!(result.failed.is_empty(), "failed: {:?}", result.failed);
        assert_eq!(result.freed_bytes, 1_400_000_000);
        let calls = executor.calls.borrow();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "npm");
        assert_eq!(
            calls[0].1,
            vec![
                "cache".to_string(),
                "clean".to_string(),
                "--force".to_string()
            ]
        );
    }

    #[test]
    fn dry_run_cache_command_does_not_invoke_executor() {
        let home = tempdir().unwrap();
        let entry = CacheEntry {
            id: "npm-cache".to_string(),
            label: "npm cache".to_string(),
            tool: "npm".to_string(),
            paths: vec![],
            bytes: 1_000,
            risk: crate::model::CacheRisk::Safe,
            strategy: CleanStrategy::Command {
                program: "npm".to_string(),
                args: vec!["cache".to_string(), "clean".to_string()],
            },
            description: String::new(),
        };

        let executor = FakeExecutor::default();
        let c = CleanupContext {
            home: home.path().to_path_buf(),
            allowed_paths: vec![],
            caches: vec![entry],
            executor: &executor,
        };
        let request = CleanupRequest {
            targets: vec![CleanupTarget::Cache {
                id: "npm-cache".to_string(),
            }],
            dry_run: true,
            allow_dirty_git: false,
        };
        let result = run_cleanup(request, &c);

        assert!(result.failed.is_empty());
        assert_eq!(result.freed_bytes, 1_000);
        assert!(executor.calls.borrow().is_empty());
    }

    #[test]
    fn unknown_cache_id_fails_gracefully() {
        let home = tempdir().unwrap();
        let executor = FakeExecutor::default();
        let c = CleanupContext {
            home: home.path().to_path_buf(),
            allowed_paths: vec![],
            caches: vec![],
            executor: &executor,
        };
        let request = CleanupRequest {
            targets: vec![CleanupTarget::Cache {
                id: "nope".to_string(),
            }],
            dry_run: false,
            allow_dirty_git: false,
        };
        let result = run_cleanup(request, &c);

        assert_eq!(result.failed.len(), 1);
        assert!(result.removed.is_empty());
    }

    #[test]
    fn log_file_is_created_and_appended_in_fake_home() {
        let home = tempdir().unwrap();
        let target_a = home.path().join("node_modules");
        sparse_file(&target_a.join("f"), 4096);
        let target_b = home.path().join("target");
        sparse_file(&target_b.join("f"), 4096);

        let executor = FakeExecutor::default();
        let log_path = home.path().join("Library/Logs/Molt/cleanup.log");

        let c1 = ctx(home.path(), vec![target_a.clone()], &executor);
        run_cleanup(artifact_request(&target_a, true), &c1);
        let after_first = fs::read_to_string(&log_path).unwrap();
        let lines_after_first = after_first.lines().count();
        assert!(lines_after_first > 0);

        let c2 = ctx(home.path(), vec![target_b.clone()], &executor);
        run_cleanup(artifact_request(&target_b, true), &c2);
        let after_second = fs::read_to_string(&log_path).unwrap();

        assert!(after_second.starts_with(&after_first));
        assert!(after_second.lines().count() > lines_after_first);
    }
}
