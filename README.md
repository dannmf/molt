# Molt

App desktop para macOS (Tauri 2 + Rust + React/TS) que:

1. encontra projetos de código no disco, identifica a stack e mostra quanto espaço cada um
   ocupa, separando o que é regenerável (`node_modules`, `target/`, `build/`, `Pods`...) do
   que não é;
2. lista caches de ferramentas de dev (Xcode, Gradle, npm/pnpm/yarn, CocoaPods, Homebrew,
   Docker) e permite limpá-los com segurança.

Não tem (e não vai ter) recursos de "liberar RAM" ou "otimizar o sistema".

## Rodando localmente

```
pnpm install
just dev
```

## Comandos

Veja `AGENTS.md` para o mapa do código, convenções de worktree/branch e o fluxo de PR.
Resumo rápido:

- `just check` — fmt, clippy, testes Rust, typecheck, lint e testes do frontend.
- `just dev` — app em modo dev.
- `just fixtures-demo` — cria um HOME falso em `/tmp/molt-demo` com projetos e caches de
  exemplo, para testar a UI sem tocar no seu HOME real.
- `just build` — gera `.app` e `.dmg`.

## Arquitetura

Ver `docs/architecture.md`.
