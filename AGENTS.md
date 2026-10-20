# AGENTS.md — Molt

App desktop macOS (Tauri 2 + Rust + React/TS) que mapeia projetos de código, mostra o espaço
recuperável e limpa artefatos e caches de dev com segurança.

## Fora de escopo (não implementar)
- "Liberar RAM", matar processos, "otimizar" o sistema.
- Limpar ~/Library/Caches inteiro ou qualquer coisa fora do catálogo de caches.

## Comandos
- `just check` — fmt, clippy -D warnings, cargo test, typecheck, lint, vitest. Obrigatório antes de
  declarar qualquer tarefa pronta.
- `just dev` — app em modo dev.
- `just fixtures-demo` — cria HOME falso em /tmp/molt-demo.
- `just build` — .app e .dmg.

## Mapa do código
- src-tauri/src/model.rs — contratos. Espelho em src/types.ts.
- scanner/ varre o disco e mede · detectors/ identifica stack, artefatos e git
- caches/ catálogo de caches · cleanup/ deleção segura · commands.rs liga tudo ao Tauri
- testkit/ fixtures de HOME falso · src/ frontend · docs/ arquitetura e pedidos de contrato

## Worktrees
Todo worktree fica em ~/orca/workspaces/molt/<nome> e é criado pelo próprio
agente: `git worktree add ~/orca/workspaces/molt/<nome> -b feat/<nome> main`.
Rode `git worktree list` antes; se já existir, reutilize. Nunca crie worktree em outro caminho
nem trabalhe no checkout principal.

## Branches
- A branch principal é main. Nunca commitar direto em main; tudo entra por Pull Request.
- Cada worktree usa a branch feat/<nome>, criada a partir de main atualizado.

## Pull Request e limpeza
1. Com `just check` verde: `git push -u origin feat/<nome>` e
   `gh pr create --base main --head feat/<nome>` com corpo contendo o que mudou, como foi
   testado, o que ficou de fora e riscos. Passe o link e pare. Nunca faça merge sozinho.
2. Quando o usuário avisar que o PR foi mergeado:
   - Confirme: `gh pr view feat/<nome> --json state -q .state` deve retornar MERGED. Se não, pare.
   - Vá para o checkout principal (primeira linha de `git worktree list`), `git switch main`
     e `git pull --ff-only`.
   - `git worktree remove ~/orca/workspaces/molt/<nome>` (sem --force; se recusar por mudanças
     pendentes, pare e avise).
   - `git branch -d feat/<nome>`, `git worktree prune` e, se a branch remota ainda existir,
     `git push origin --delete feat/<nome>`.
   - Confirme com `git worktree list` e `du -sh ~/orca/workspaces/molt` e informe o espaço liberado.

## Posse de pastas (trabalho paralelo)
Cada worktree edita só a sua pasta. model.rs, types.ts, commands.rs e justfile só mudam no
bootstrap ou na integração. Precisa de mudança de contrato? Registre em docs/contract-requests.md
e siga com workaround local.

## Regras de segurança (não negociáveis)
- Toda deleção vai para a Lixeira (crate trash). Nunca remove_dir_all fora de testes.
- Testes só tocam em tempdirs do testkit. Nunca no HOME real.
- Lógica recebe `home: &Path` por parâmetro; só commands.rs lê o home real.
- Comandos externos: sem shell, com timeout, binário resolvido no PATH.
- Não seguir symlinks. Tamanho = st_blocks * 512 com dedup de hardlinks.

## Estilo
- Rust: erros com thiserror, sem unwrap fora de testes, funções puras sempre que possível.
- TS: strict, sem any, chamadas ao backend só via src/api/client.ts.
- Textos da UI em pt-BR. Código, commits e identificadores em inglês.
- Conventional Commits, commits pequenos.

## Ao terminar uma tarefa
Responda com: o que mudou, como foi testado, o que ficou de fora, riscos conhecidos.
