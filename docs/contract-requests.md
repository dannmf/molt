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
