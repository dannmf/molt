set shell := ["bash", "-euo", "pipefail", "-c"]

# Roda tudo que precisa estar verde antes de declarar uma tarefa pronta.
check:
    cd src-tauri && cargo fmt --check
    cd src-tauri && cargo clippy --all-targets --features testkit -- -D warnings
    cd src-tauri && cargo test --features testkit
    pnpm typecheck
    pnpm lint
    pnpm test

# App em modo dev (abre a janela do Tauri).
dev:
    pnpm tauri dev

# .app e .dmg de release.
build:
    pnpm tauri build

# Gera um HOME falso em /tmp/molt-demo com projetos e caches de exemplo, para testar a UI.
fixtures-demo:
    cd src-tauri && cargo run --bin fixtures_demo --features testkit
