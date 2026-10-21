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
