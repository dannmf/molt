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

## Acesso Total ao Disco (macOS)

Para o Molt enxergar projetos fora de pastas sandboxed (ex: `~/Developer`, `~/Projects`) e
detectar caches de ferramentas como Xcode e simuladores, o macOS normalmente exige a permissão
**Acesso Total ao Disco**:

1. Abra **Ajustes do Sistema -> Privacidade e Segurança -> Acesso Total ao Disco**.
2. Adicione o `Molt.app` (ou, em modo dev, o binário em
   `src-tauri/target/debug/molt`) e habilite a permissão.
3. Reinicie o app.

Sem essa permissão, a varredura roda normalmente mas pode pular diretórios/caches protegidos
pelo macOS, mostrando tamanhos subestimados ou "indisponível" nos caches do Xcode/Simulador.

## Arquitetura

Ver `docs/architecture.md`.
