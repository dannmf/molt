import { useEffect, useState } from "react";

import { useCleanup } from "../../hooks/useCleanup";
import { canConfirmCleanup } from "../../lib/cleanupGate";
import type { CleanupPlan } from "../../lib/cleanupPlan";
import { formatBytes } from "../../lib/format";
import { AlertIcon } from "../icons/Icons";

/** Tempo simulado do "dry run" antes do botão Confirmar liberar. Não há chamada real
 * ao backend aqui: o mock de `runCleanup` sempre devolve zero, então o preview
 * (lista + total) é calculado no frontend a partir dos dados já carregados
 * (ver `lib/cleanupPlan.ts` e a nota em `docs/contract-requests.md`). */
const DRY_RUN_DELAY_MS = 450;

interface ConfirmCleanupModalProps {
  plan: CleanupPlan | null;
  onClose: () => void;
  onConfirmed: (plan: CleanupPlan) => void;
}

export function ConfirmCleanupModal({ plan, onClose, onConfirmed }: ConfirmCleanupModalProps) {
  const [previewReady, setPreviewReady] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [trackedPlan, setTrackedPlan] = useState(plan);
  const cleanup = useCleanup();

  if (plan !== trackedPlan) {
    setTrackedPlan(plan);
    setPreviewReady(false);
    setTypedName("");
    cleanup.reset();
  }

  useEffect(() => {
    if (!plan) {
      return;
    }
    const timer = window.setTimeout(() => setPreviewReady(true), DRY_RUN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [plan]);

  if (!plan) {
    return null;
  }

  const canConfirm = canConfirmCleanup({
    previewReady,
    requiresNameConfirmation: plan.requiresNameConfirmation,
    typedName,
    projectName: plan.projectName ?? "",
  });

  function handleConfirm() {
    cleanup.mutate(
      { targets: plan!.targets, allowDirtyGit: plan!.requiresNameConfirmation },
      {
        onSuccess: () => {
          onConfirmed(plan!);
          onClose();
        },
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{plan.title}</h2>

        <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-black/5 bg-black/[0.02] dark:border-white/5 dark:bg-white/[0.03]">
          {!previewReady ? (
            <p className="p-3 text-sm text-neutral-500 dark:text-neutral-400">Calculando o que vai sair da pasta...</p>
          ) : plan.preview.length === 0 ? (
            <p className="p-3 text-sm text-neutral-500 dark:text-neutral-400">Nada para remover.</p>
          ) : (
            <ul className="divide-y divide-black/5 dark:divide-white/5">
              {plan.preview.map((item) => (
                <li key={item.path} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="truncate text-neutral-700 dark:text-neutral-300">{item.path}</span>
                  <span className="shrink-0 tabular-nums text-neutral-500 dark:text-neutral-400">{formatBytes(item.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">Total a liberar</span>
          <span className="tabular-nums font-semibold text-neutral-900 dark:text-neutral-100">
            {previewReady ? formatBytes(plan.totalBytes) : "..."}
          </span>
        </div>

        {plan.requiresNameConfirmation && previewReady && (
          <div className="mt-4 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
            <p className="flex items-start gap-2 text-sm text-orange-700 dark:text-orange-300">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              Este projeto tem alterações não commitadas ou não enviadas. Digite{" "}
              <strong className="font-semibold">{plan.projectName}</strong> para confirmar.
            </p>
            <input
              type="text"
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              placeholder={plan.projectName ?? ""}
              className="mt-2 w-full rounded-md border border-orange-500/40 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-orange-500 dark:bg-neutral-900"
            />
          </div>
        )}

        {cleanup.isError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">Não foi possível concluir a limpeza.</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canConfirm || cleanup.isPending}
            onClick={handleConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:bg-red-700"
          >
            {cleanup.isPending ? "Limpando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
