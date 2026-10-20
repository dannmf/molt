# Arquitetura do Molt

## Visão geral

Molt é um app Tauri 2: um binário Rust (`src-tauri/`) expõe comandos via `invoke()` para
um frontend React/TS (`src/`). O Rust nunca abre uma UI própria; toda interação é via
comandos e eventos Tauri. O domínio tem quatro responsabilidades isoladas em módulos:

- **scanner/** varre diretórios sob as raízes pedidas e mede tamanho em disco.
- **detectors/** olha um diretório de projeto e decide a stack, os artefatos
  regeneráveis e o estado git.
- **caches/** conhece onde ferramentas de dev (Xcode, Gradle, npm/pnpm/yarn, CocoaPods,
  Homebrew, Docker) guardam cache e como listar essas entradas.
- **cleanup/** executa a remoção (sempre via Lixeira) respeitando `dry_run` e
  `allow_dirty_git`.

Todos os quatro são `trait`s com uma implementação `Stub*` que só tem `todo!()` — este PR
não implementa nenhuma lógica de feature, só os contratos e o esqueleto para que os
próximos 4 worktrees (um por módulo, mais o de UI) implementem em paralelo sem pisar um
no outro. `commands.rs` liga tudo ao Tauri e hoje devolve dados mock, para que o
frontend e o harness de testes tenham algo real para consumir enquanto o resto é
construído.

## Contratos (`model.rs` / `types.ts`)

`src-tauri/src/model.rs` é a fonte de verdade; `src/types.ts` é o espelho manual. A
paridade 1:1 é garantida por um fixture compartilhado: `src-tauri/tests/model_snapshot.rs`
serializa um exemplo de cada tipo e compara com `fixtures/model-snapshot.json`;
`src/api/__tests__/types.test.ts` compara um literal TypeScript (tipado por `types.ts`)
contra o mesmo arquivo. Se `model.rs` e `types.ts` divergirem — campo renomeado, variante
faltando — um dos dois lados quebra. Para regenerar o fixture depois de mudar
`model.rs`: `cargo test --test model_snapshot generate_fixture -- --ignored` e depois
atualizar o literal em `types.test.ts` à mão.

Todos os estruturas/enums usam `#[serde(rename_all = "camelCase")]`; uniões (enums com
dados, como `CleanStrategy` e `CleanupTarget`) usam tag externa `"type"`. `ArtifactKind`
tem uma variante com dado (`Other(String)`), que serializa como `{"other": "..."}`.

## Regras de medição de tamanho

- **Tamanho = blocos alocados (`st_blocks * 512`), nunca `st_size`.** Em APFS, arquivos
  esparsos e arquivos comprimidos reportam `st_size` muito maior que o espaço realmente
  ocupado; `st_blocks` é o que corresponde ao que o Finder/`du` mostram.
- **Hardlinks são deduplicados por `(dev, ino)` dentro de uma mesma varredura.** Isso
  importa de verdade para stores de conteúdo endereçável (pnpm, por exemplo, hardlinka o
  mesmo pacote em `node_modules/.pnpm` de vários projetos): sem dedup, o mesmo bloco físico
  seria contado várias vezes e o "espaço recuperável" ficaria inflado.
- **Symlinks nunca são seguidos.** Além de ser a semântica certa para medir disco, isso
  evita loops infinitos (um symlink pode apontar para um ancestral do próprio diretório).

Essas três regras estão implementadas em `testkit::disk_usage_bytes` e devem ser
replicadas (não reinventadas) pelo scanner real — a função do testkit existe justamente
para servir de referência/oráculo nos testes do scanner.

## Harness de testes (`testkit/`)

`testkit` é compilado só com `cfg(test)` ou a feature `testkit`, nunca em build normal.
Toda função recebe `home: &Path` e escreve só ali dentro — nunca no HOME real. As
fixtures disponíveis: `fixture_node_project`, `fixture_rust_project`,
`fixture_expo_project`, `fixture_flutter_project`, `fixture_git_dirty_repo` (repositório
git real via `git2`, com um commit e uma mudança não commitada), `fixture_hardlinked_store`
(simula o store de conteúdo endereçável do pnpm, com um arquivo real hardlinkado em dois
projetos) e `fixture_symlink_loop` (diretório com um symlink apontando para si mesmo).
`fixture_fake_caches` monta um conjunto de caches falsas nos mesmos caminhos relativos
que as ferramentas reais usam no macOS.

Arquivos grandes são esparsos (`File::set_len`, sem escrever dados), por isso cada
fixture devolve o tamanho em disco que ela própria mediu (`bytes_on_disk`). Testes do
scanner devem comparar contra esse valor, nunca contra um número fixo — a alocação de
blocos de um arquivo esparso varia por filesystem.

`just fixtures-demo` usa as mesmas fixtures para montar um HOME falso em
`/tmp/molt-demo`, útil para testar a UI manualmente sem tocar no HOME real.

## Decisões tomadas neste bootstrap (revisar)

1. **`git2` com `default-features = false`, só `vendored-libgit2`.** `GitInfo` só
   precisa de branch/dirty/commits locais, não de transporte de rede (push/fetch), então
   deixei `ssh`/`https` desligados para reduzir tempo de build. Se algum worktree
   precisar de rede via `git2` (ex.: contar commits à frente de um remoto que exige
   autenticação), isso vai precisar ser revisto.
2. **`scan_projects` é genérico em `R: tauri::Runtime`** (`AppHandle<R>` em vez de
   `AppHandle`) para poder ser chamado contra o `MockRuntime` no teste de fumaça
   (`tests/commands_smoke.rs`). A assinatura vista pelo frontend via `invoke()` não muda.
3. **`run_cleanup` não usa `todo!()`.** Devolve um `CleanupResult` vazio respeitando
   `dry_run`, em vez de panicar, porque um comando que apaga arquivos não deveria ter um
   mock que trava — preferi um no-op seguro a um placeholder que quebra a UI.
   `reveal_in_finder` continua com `todo!()` porque não tem um mock seguro equivalente
   (é puramente um efeito colateral).
4. **`testkit` tem lógica real, não só stubs.** O resto do domínio (scanner/detectors/
   caches/cleanup) ficou com `todo!()` de propósito, mas o harness de teste precisa
   funcionar de verdade para os outros 4 worktrees terem fixtures confiáveis desde o
   primeiro dia.
5. **Ícones gerados automaticamente** (`cargo tauri icon` a partir de um placeholder
   cinza-escuro liso). Precisam ser substituídos por uma identidade visual real antes de
   qualquer release.
6. **TypeScript fixado em `5.9.x`.** O `pnpm add` mais recente resolveu `typescript@7.0.2`
   (a reescrita nativa/`tsgo`), mas `typescript-eslint` ainda não suporta essa major;
   fixei em `^5` para manter `pnpm lint` funcionando. Revisar quando o ecossistema
   migrar.
7. **Tailwind v4** (`@tailwindcss/postcss`, sem `tailwind.config.js`): a v4 descobre
   conteúdo automaticamente via o import no CSS, não precisa de config explícita para o
   caso de uso atual (só o placeholder em `App.tsx`).
8. **`default-run = "molt"` em `Cargo.toml`.** Com dois binários (`molt` e
   `fixtures_demo`), `cargo run` (usado por `pnpm tauri dev`) passou a exigir `--bin`
   explícito; `default-run` resolve a ambiguidade sem mudar como os worktrees chamam
   `fixtures-demo`.
