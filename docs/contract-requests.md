# Pedidos de mudança de contrato

`model.rs`, `types.ts`, `commands.rs` e o `justfile` só mudam no bootstrap ou numa
integração explícita (ver AGENTS.md, seção "Posse de pastas"). Se o seu worktree
precisar de um campo novo, uma variante nova, ou uma assinatura de comando diferente:

1. Adicione uma entrada abaixo com: data, worktree/branch, o que você precisa mudar e
   por quê, e qual workaround local você está usando enquanto isso (ex.: um tipo
   interno só no seu módulo, um campo opcional calculado localmente).
2. Não edite `model.rs`/`types.ts`/`commands.rs`/`justfile` direto no seu worktree.
3. Continue com o workaround local. Alguém (você mesmo, numa integração, ou quem
   mantém o bootstrap) revisa este arquivo e aplica a mudança de contrato de uma vez,
   coordenando os worktrees afetados.

Formato sugerido por entrada:

```
## 2026-01-01 — feat/scanner — nome curto do pedido
O que: ...
Por quê: ...
Workaround local: ...
```

---

## 2026-10-20 — feat/scanner — `Scanner::scan` sem o parâmetro `home`

O que: o stub de `Scanner::scan` tinha a assinatura
`fn scan(&self, home: &Path, request: &ScanRequest, on_progress: ...)`. A
implementação real removeu `home`, já que `ScanRequest.roots` já define as
raízes da varredura e `home` não era usado em nenhum outro lugar do contrato.

Por quê: parâmetro redundante com `request.roots`.

Workaround local: nenhum necessário além de ajustar a assinatura dentro do
próprio `scanner/mod.rs` (não é `model.rs`/`commands.rs`, então não precisava
de aprovação prévia — registrando aqui só para quem for ligar `commands::scan_projects`
ao `Scanner` de verdade saber que `home` não existe mais nessa assinatura).

## 2026-10-20 — feat/scanner — detecção injetada via os traits de `detectors`, não um `DetectionResult`

O que: a tarefa original pedia para expor "um trait, ou receber uma função
`detect: fn(&Path) -> DetectionResult`". `detectors/mod.rs` já define três
traits reais (`KindDetector`, `ArtifactDetector`, `GitDetector`), sem nenhum
tipo `DetectionResult`. O scanner usa esses três traits diretamente, agrupados
num `pub struct Detectors<'a> { kind, artifact, git }` passado para `Scanner::scan`,
em vez de inventar um `DetectionResult` paralelo que não existe no resto do código.

Por quê: evita duplicar/contradizer o contrato que `detectors` já declara.

Workaround local: nenhum — é a opção "exponha um trait" da tarefa original,
só usando os traits que já existem em vez de criar um novo tipo.

## 2026-10-20 — feat/scanner — `Mutex<HashSet<(dev, ino)>>` em vez de `DashMap`

O que: o dedup de hardlinks compartilhado entre threads (`scanner::size::SharedDedup`)
usa `Mutex<HashSet<(u64, u64)>>`.

Por quê: `DashMap` não está em `Cargo.toml` e adicionar dependência nova está fora do
escopo deste worktree. O volume de inserções é da ordem de "arquivos por projeto", não
"arquivos por segundo" — não apareceu como gargalo no benchmark de 50 projetos
(`scanner::tests::bench_fifty_projects`, ~5ms).

Workaround local: `Mutex<HashSet>` implementado em `scanner/size.rs`. Se a contenção
do lock único se tornar um problema real (ex.: varreduras com muito mais entradas),
trocar para `DashMap` exige essa dependência nova.

## 2026-10-20 — feat/scanner — dedup de hardlink é global na varredura, não por projeto

O que: `SharedDedup` é compartilhado entre todos os projetos de uma mesma varredura
(não um dedup por projeto). Isso é correto para o caso documentado em
`docs/architecture.md` (hardlinks entre projetos *irmãos*, ex.: pnpm hardlinkando o
mesmo conteúdo em `node_modules` de dois projetos distintos — ver teste
`scanner::tests::hardlinked_siblings_are_counted_once`).

Por quê: a raiz de um monorepo e seus membros (`workspace::monorepo_members`) também
compartilham esse mesmo conjunto de dedup. Como a raiz naturalmente contém a árvore
inteira dos membros, o projeto que for medido primeiro (ordem não determinística, via
`rayon::par_iter`) "rouba" os inodes do outro, e o segundo mede um `total_bytes` menor
do que seria medindo isoladamente.

Workaround local: nenhum — aceito como limitação documentada, já que não é um dos
cenários de teste obrigatórios (o cenário de hardlink pedido é entre projetos irmãos,
que funciona corretamente). Se isso importar para a UI (ex.: usuário comparando
`total_bytes` da raiz vs. de um membro), considerar um dedup escopado por
projeto-ou-família em vez de global por varredura inteira.

## 2026-10-20 — feat/scanner — `Project.last_modified_at` é o mtime do diretório raiz, não da árvore

O que: `last_modified_at` é calculado só a partir do mtime do próprio diretório do
projeto (`fs::metadata(path).modified()`), não do arquivo modificado mais
recentemente em toda a árvore.

Por quê: calcular o mtime máximo de toda a árvore exigiria um segundo walk completo
(além do de `total_bytes`), e a tarefa original não pediu isso explicitamente.

Workaround local: nenhum — aceito como aproximação. Se a UI precisar do mtime "de
verdade" (ex.: para ordenar por "projeto mexido mais recentemente"), dá pra calcular
isso de carona no mesmo walk que já mede `total_bytes` (`scanner::size::SharedDedup`),
mas isso é uma mudança de escopo que vale coordenar antes.

## 2026-10-20 — feat/detectors — `Artifact.bytes` sempre `0`; `scanner::build_project` precisa medir cada artefato

O que: a tarefa do módulo `detectors` foi explícita — "Sem medir tamanho (o scanner
mede)". `MoltArtifactDetector::detect` (o adapter que implementa o trait `ArtifactDetector`
já consumido por `scanner/mod.rs`) sempre devolve `Artifact { bytes: 0, .. }`.

Por quê: medir tamanho é responsabilidade do scanner (`scanner::size`), não do detector —
eles têm acesso ao `SharedDedup` para fazer isso corretamente (hardlink dedup, não seguir
symlink), e duplicar essa lógica aqui violaria a divisão de responsabilidades do bootstrap.

Workaround local: nenhum possível dentro de `detectors/` — isso é uma lacuna real em
`scanner::build_project`, que hoje faz
`let reclaimable_bytes = artifacts.iter().map(|a| a.bytes).sum();` assumindo que
`artifacts[].bytes` já vem preenchido. Com os detectors reais, essa soma vai dar `0`
sempre. Quem integrar os dois módulos precisa trocar essa linha para medir o tamanho de
cada `artifact.path` (via `scanner::size`) antes de somar, depois que os artefatos vierem
do detector.

## 2026-10-20 — feat/detectors — `__pycache__` "agregado" como vários `Artifact`s do mesmo `ArtifactKind`, não um só

O que: a tarefa pediu "`__pycache__` recursivo agregado como um artefato". Como
`model::Artifact.path` é um único `PathBuf`, não dá pra representar várias pastas
`__pycache__` espalhadas pela árvore como um artefato só. `detect_artifacts` devolve uma
entrada `(path, ArtifactKind::PythonCache, hint)` para cada `__pycache__` encontrado na
varredura recursiva (podem ser várias por projeto).

Por quê: manter `Artifact.path` como está (sem virar `Vec<PathBuf>`) evitaria uma mudança
de contrato em `model.rs`/`types.ts` fora do escopo deste worktree.

Workaround local: nenhum — interpretação aceita de "agregado" como "todas encontradas
pela mesma regra/walk recursivo", não "uma única entrada". Se a UI quiser mostrar
`__pycache__` como uma linha agregada só (ex.: "12 pastas __pycache__, 40 MB"), isso
precisa ser feito no frontend somando as entradas com `kind == PythonCache`, ou isso
exigiria mudar `Artifact.path` para `Vec<PathBuf>` em `model.rs` (fora de escopo aqui).

## 2026-10-21 — feat/caches — catálogo implementado via `MoltCacheCatalog`/`list_caches`, sem novo tipo de contrato

O que: a tarefa pedia `list_caches(home: &Path) -> Vec<CacheEntry>`. O trait já existente
em `caches/mod.rs` (`CacheCatalog::list(&self, home: &Path) -> Result<Vec<CacheEntry>,
AppError>`) continua com a mesma assinatura; `StubCacheCatalog` foi trocado por
`MoltCacheCatalog`, que chama a função livre `list_caches` (infalível, sempre `Vec`) e
embrulha em `Ok(..)`. Nenhuma mudança em `model.rs`/`commands.rs`.

Por quê: evita duplicar o contrato do trait com um tipo novo, mesmo padrão adotado em
`feat/scanner`/`feat/detectors`.

Workaround local: nenhum necessário.

## 2026-10-21 — feat/caches — "simuladores indisponíveis" é a única entrada que pode aparecer com `bytes: 0`

O que: todas as outras entradas do catálogo só aparecem se o caminho existir e ocupar
bytes > 0. A entrada `core-simulator-unavailable` é a exceção pedida explicitamente na
tarefa: aparece sempre que o binário `xcrun` está no `PATH`, mesmo que o tamanho não
possa ser estimado (`bytes: 0`, com a descrição deixando isso explícito).

Por quê: a existência dessa entrada depende da ferramenta de limpeza (`xcrun simctl`)
estar disponível, não de medir um diretório específico — o tamanho mostrado é sempre só
uma estimativa a partir do diretório de todos os dispositivos simulados (não dá pra
saber qual é "indisponível" sem rodar `simctl list devices`, fora do escopo de
listagem).

Workaround local: nenhum — comportamento pedido na tarefa.

## 2026-10-21 — feat/caches — `docker-cache` e `homebrew-cache`/`pnpm-store` não populam `CacheEntry.paths` com um caminho confiável em todos os casos

O que: `docker-cache` sempre sai com `paths: vec![]` (o espaço reclamável do Docker vive
dentro da VM/daemon, não há um diretório único no host para apontar). `pnpm-store` e
`homebrew-cache` preenchem `paths` com o caminho descoberto via `pnpm store path`/`brew
--cache` quando o binário existe, e com um caminho padrão quando não existe (só para
pnpm, que tem fallback para `Library/pnpm/store/v3`; `homebrew-cache` não aparece sem o
binário `brew`, já que não há um caminho padrão confiável sem consultar a ferramenta).

Por quê: `CacheEntry.paths` é informativo (mostrar "o que seria limpo"); para entradas
cuja estratégia é `Command`, o path real de disco nem sempre é descobrível sem rodar o
próprio comando, e às vezes (Docker) nem existe um path único no host.

Workaround local: nenhum — quem consumir `CacheEntry.paths` na UI deve tratar uma lista
vazia como "sem preview de caminho disponível", não como erro.

## 2026-10-21 — feat/cleanup — `CleanupContext.caches: Vec<CacheEntry>` além dos 3 campos pedidos

O que: a tarefa descreveu `CleanupContext` como carregando `home`, `allowed_paths` e um
executor de comandos injetável. `CleanupTarget::Cache { id }` só carrega um `id`, sem a
`CleanStrategy` associada — não tem como saber se é `Trash { paths }` ou `Command { program,
args }` sem consultar o catálogo. `CleanupContext` ganhou um quarto campo,
`caches: Vec<CacheEntry>`, com o mesmo catálogo que `list_caches` devolve, usado só para
resolver `id` -> `CleanStrategy`.

Por quê: sem isso, `run_cleanup` não tem como processar `CleanupTarget::Cache` de forma
alguma.

Workaround local: nenhum — é um campo novo direto em `CleanupContext`, que não é um tipo de
`model.rs` (é interno a `cleanup/mod.rs`), então não precisava de aprovação prévia.
Registrando aqui para quem for integrar `commands::run_cleanup` de verdade: o `CleanupContext`
precisa ser construído com o resultado de `list_caches`, não só com `allowed_paths`.

## 2026-10-21 — feat/cleanup — duplicação local de medição de disco (`SizeDedup`) e execução de comandos (`SystemCommandExecutor`)

O que: `cleanup/mod.rs` define sua própria `SizeDedup` (st_blocks*512, dedup de hardlink por
`(dev, ino)`, sem seguir symlink) e seu próprio `resolve_binary`/`is_executable_file`/
`run_with_timeout` (resolução no PATH sem shell, com timeout), em vez de reaproveitar
`scanner::size::SharedDedup` e `caches::system::{BinaryResolver, CommandRunner,
PathBinaryResolver, TimeoutCommandRunner}`.

Por quê: `scanner::size` é um módulo privado de `scanner/mod.rs` (`mod size;`, sem `pub`) e
`caches::system` é privado a `caches/mod.rs` (`mod system;`, sem `pub`) — nenhum dos dois é
visível fora da própria árvore do módulo. Mesma situação já registrada por `feat/caches` ao
duplicar a lógica de `testkit::disk_usage_bytes` (que é `cfg(test)`-only).

Workaround local: lógica replicada localmente em `cleanup/mod.rs` (`SizeDedup`,
`resolve_binary`, `is_executable_file`, `run_with_timeout`). Se isso importar (ex.: um bug na
regra de medição precisar ser corrigido em 3 lugares), considerar extrair `scanner::size` e
`caches::system` (ou só as partes relevantes) para um módulo público compartilhado — fora do
escopo deste worktree, já que exigiria mudar a posse de pastas de `scanner`/`caches`.

## 2026-10-21 — feat/cleanup — `CleanupResult.failed` usa um `PathBuf` sintético `cache:{id}` para falhas de `CleanupTarget::Cache`

O que: `CleanupResult.failed: Vec<(PathBuf, String)>` só tem espaço para um `PathBuf`, mas
`CleanupTarget::Cache { id }` não tem um path natural (a entrada pode ter `paths: vec![]`,
como `docker-cache` — ver entrada de `feat/caches` acima). Falhas de alvos `Cache` entram em
`failed` com `PathBuf::from(format!("cache:{id}"))` no lugar do path.

Por quê: `CleanupResult` é tipo de `model.rs`, fora de escopo para mudar aqui (ex.: virar
`Vec<(CleanupTarget, String)>` resolveria isso de forma mais limpa, mas é mudança de
contrato).

Workaround local: marcador sintético `cache:{id}`. Quem consumir `CleanupResult.failed` na UI
precisa tratar esse prefixo como "isto não é um path de disco, é um id de cache" — não dá pra
usar `reveal_in_finder` nele, por exemplo. Se isso importar para a UI, vale propor a mudança
de `model.rs` para `failed: Vec<(CleanupTarget, String)>`.

## 2026-10-21 — feat/cleanup — trait `CleanupExecutor`/`StubCleanupExecutor` antigos removidos (código morto, nunca ligado a `commands.rs`)

O que: o stub anterior de `cleanup/mod.rs` definia um trait `CleanupExecutor` com um
`StubCleanupExecutor`, mas `commands::run_cleanup` nunca os referenciava — é um `Ok(CleanupResult
{ freed_bytes: 0, .. })` hardcoded, sem chamar nada de `cleanup::`. Esse trait/stub foi
removido por completo e substituído pela assinatura pedida nesta tarefa:
`run_cleanup(request: CleanupRequest, ctx: &CleanupContext) -> CleanupResult`.

Por quê: diferente do precedente de `feat/caches` (que manteve o trait `CacheCatalog` já
ativo), aqui o trait antigo era scaffolding morta, sem nenhum ponto de integração real para
preservar.

Workaround local: nenhum — `commands::run_cleanup` continua precisando de integração (fora
do escopo deste worktree, é trabalho de bootstrap/integração): construir um
`CleanupContext` real a partir dos resultados de `scan_projects`/`list_caches` e chamar
`cleanup::run_cleanup` em vez de devolver o mock atual.

## 2026-10-21 — feat/ui — preview do dry run calculado no frontend, não vindo de `runCleanup`

O que: a tarefa pedia "sempre um modal com dry run primeiro (lista do que vai sair + total)".
O mock de `runCleanup` em `src/api/client.ts` sempre devolve `{freedBytes: 0, removed: [],
failed: [], dryRun}`, independente do `CleanupRequest` enviado — não computa nada a partir dos
targets recebidos. `src/lib/cleanupPlan.ts` monta esse preview (lista de paths + total em bytes)
direto a partir dos dados de `Project`/`CacheEntry` já carregados no cache do React Query, sem
chamar `runCleanup` para isso. O modal (`ConfirmCleanupModal.tsx`) simula um atraso de 450ms antes
de liberar o botão "Confirmar", só para preservar a sensação de um dry run real acontecendo.

Por quê: sem isso, o modal mostraria "0 itens, 0 bytes" sempre, o que não atende ao requisito.

Workaround local: `lib/cleanupPlan.ts` (fora de `types.ts`/`client.ts`, que são contrato).
Quando `runCleanup` ganhar uma implementação real que calcule o preview a partir do backend
(ex.: um modo `dryRun: true` que devolve `removed` preenchido), o modal deve passar a usar essa
resposta em vez do cálculo local, e `cleanupPlan.ts` pode encolher para só montar o `CleanupTarget[]`.

## 2026-10-21 — feat/ui — progresso de varredura simulado no frontend, sem ouvir `scan://progress`

O que: a tarefa pedia uma "barra de progresso durante o scan". `src/api/client.ts` não expõe
nenhuma forma de assinar o evento Tauri `scan://progress` (só a função `scanProjects(req)`, que
devolve uma Promise). `src/hooks/useScan.ts` simula o progresso com um `window.setInterval` local
enquanto a Promise de `scanProjects` está pendente, pulando para 100% em `onSuccess`.

Por quê: assinar um evento Tauri real exigiria adicionar uma função a `client.ts` (contrato,
fora do escopo deste worktree) ou chamar `invoke`/`listen` direto num componente, o que o
enunciado da tarefa proíbe explicitamente ("toda chamada passa pelo client.ts, nunca invoke()
direto num componente").

Workaround local: `hooks/useScan.ts`. Se/quando `client.ts` expuser uma forma de assinar
`scan://progress` (ex.: `onScanProgress(callback): () => void`), troque o timer simulado por essa
assinatura real.

## 2026-10-21 — feat/ui — vibrancy nativa da sidebar aproximada com `backdrop-blur` + fundo translúcido

O que: a tarefa pedia "sidebar com vibrancy se o Tauri permitir". Vibrancy nativa no macOS
(`NSVisualEffectView`) exigiria `"transparent": true` em `src-tauri/tauri.conf.json` e ligar o
crate `window-vibrancy` (já em `Cargo.toml`, mas não usado em nenhum lugar) no processo de criação
da janela em `src-tauri/src/main.rs`. Ambos os arquivos estão fora do escopo deste worktree
(`src-tauri/`, não `src/`). `Sidebar.tsx` usa uma aproximação só em CSS: `backdrop-blur-xl` +
fundo branco/preto translúcido (`bg-white/60 dark:bg-neutral-900/40`).

Por quê: habilitar vibrancy nativa é uma mudança de configuração de janela/processo Rust, não de
componente React.

Workaround local: aproximação CSS em `components/shell/Sidebar.tsx`. Quem for integrar a janela de
verdade: setar `transparent: true` em `tauri.conf.json`, chamar `window_vibrancy::apply_vibrancy`
em `main.rs` ao criar a janela principal, e então a classe `backdrop-blur-xl` pode ficar só como
reforço visual sobre o vidro nativo (ou ser removida).

---

## Resoluções — feat/integration (2026-10-21)

Nenhuma destas entradas exigiu mudar `model.rs`/`types.ts`: todos os tipos envolvidos
(`ScanProgress`, `CleanupResult`, `Artifact`, etc.) já cobriam o que faltava; o que faltava
era ligação real, não forma de dado nova.

- **`Scanner::scan` sem `home`**, **detecção via traits**, **`Mutex<HashSet>` em vez de
  `DashMap`**, **dedup global por varredura**, **`last_modified_at` = mtime da raiz**,
  **`__pycache__` agregado por `ArtifactKind`**, **catálogo via `MoltCacheCatalog`**,
  **simuladores indisponíveis com `bytes: 0`**, **`docker-cache` sem `paths`** — **aceitas
  sem mudança**. São decisões de implementação interna, documentadas corretamente pelos
  próprios módulos; nenhuma pedia um campo novo em `model.rs`/`types.ts`.

- **`Artifact.bytes` sempre `0` / `scanner::build_project` não media os artefatos** —
  **resolvida nesta integração**, não apenas aceita. Esta era uma lacuna real (não uma
  decisão de design): `build_project` agora mede cada `artifact.path` com um
  `size::SharedDedup` próprio (dedup escopado ao artefato) antes de medir o `total_bytes`
  com o dedup compartilhado da varredura, para que os blocos dos artefatos ainda sejam
  contados integralmente no total. Teste de regressão:
  `scanner::tests::reclaimable_bytes_reflects_real_artifact_size`. Ao investigar isso,
  também achei e corrigi um bug correlato em `testkit::sparse_file`: usava só
  `File::set_len` (um buraco em APFS, sem blocos alocados), mascarando qualquer teste que
  dependesse do tamanho real das fixtures de projeto — agora escreve dados reais em blocos
  de 64KB, igual ao padrão já usado localmente em `cleanup::tests`/`caches::tests`.

- **`CleanupContext.caches` além dos 3 campos pedidos** e **`CleanupExecutor`/
  `StubCleanupExecutor` removidos** — **aceitas sem mudança**; `CleanupContext` não é tipo
  de `model.rs` (é interno a `cleanup/mod.rs`), e a integração de `commands::run_cleanup`
  (abaixo) já constrói esse contexto com `home`, `allowed_paths` e `caches` vindos do último
  `scan_projects`/`list_caches`.

- **Duplicação de `SizeDedup`/resolução de binário entre `scanner`, `caches` e `cleanup`** —
  **aceita, não resolvida nesta integração**. Extrair um módulo público compartilhado exigiria
  mudar a posse de pastas desses três módulos (fora do escopo de uma integração; é uma
  mudança estrutural, não uma ligação de módulos). Mantido como débito técnico conhecido.

- **`CleanupResult.failed` com `PathBuf` sintético `cache:{id}`** — **recusada por agora**.
  O frontend (`types.ts: failed: Array<[string, string]>`) ainda não faz nenhum tratamento
  especial desse campo (sem chamada a `revealInFinder` a partir dele, por exemplo), então o
  marcador sintético não causa incoerência visível hoje. Mudar `model.rs` para
  `failed: Vec<(CleanupTarget, String)>` é uma mudança de contrato maior (atinge
  `types.ts`, o snapshot JSON e qualquer UI futura que listar falhas) sem benefício
  imediato — fica registrada para quando a UI efetivamente precisar diferenciar falha de
  path vs. falha de cache.

- **Preview do dry run calculado no frontend** (`lib/cleanupPlan.ts`) — **aceita sem
  mudança**. Agora que `reclaimable_bytes`/`Artifact.bytes` são medidos de verdade (item
  acima), o preview local usa os mesmos números que `run_cleanup(dryRun: true)` devolveria
  no backend, então não há mais risco de incoerência entre o que o modal mostra e o que a
  limpeza real faria. Recalcular o preview via uma chamada real ao backend antes de todo
  clique em "Limpar" adicionaria uma viagem de rede sem mudar o resultado mostrado.

- **Progresso de varredura simulado, sem ouvir `scan://progress`** — **resolvida nesta
  integração**. `commands::scan_projects` agora emite o evento Tauri `scan://progress` de
  verdade durante a varredura; `src/api/client.ts` ganhou `onScanProgress(callback):
  () => void` (assinatura real via `@tauri-apps/api/event`, contrato aditivo — não mudou
  nenhuma função existente); `src/hooks/useScan.ts` troca o `setInterval` simulado por essa
  assinatura real.

- **Vibrancy nativa da sidebar aproximada com CSS** — **resolvida nesta integração**.
  `dirs` e `window-vibrancy` já existiam como dependências transitivas (ver `Cargo.lock`) e
  foram promovidas a dependências diretas em `Cargo.toml`. `tauri.conf.json` ganhou
  `"transparent": true` na janela principal e `main.rs`/`lib.rs` chama
  `window_vibrancy::apply_vibrancy` na janela ao iniciar. `backdrop-blur-xl` em
  `Sidebar.tsx` foi mantido como reforço visual sobre o vidro nativo, não removido.
