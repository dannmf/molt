import { useEffect, useState } from "react";

import { useCleanup } from "../../hooks/useCleanup";
import { useRefreshDiskUsage } from "../../hooks/useDiskUsage";
import { canConfirmCleanup } from "../../lib/cleanupGate";
import type { CleanupPlan } from "../../lib/cleanupPlan";
import { formatBytes, pathBasename } from "../../lib/format";
import { useAppStore } from "../../store/useAppStore";

/** Tempo simulado do "dry run" antes do botão Confirmar liberar. Não há chamada real
 * ao backend aqui: o mock de `runCleanup` sempre devolve zero, então o preview
 * (lista + total) é calculado no frontend a partir dos dados já carregados
 * (ver `lib/cleanupPlan.ts` e a nota em `docs/contract-requests.md`). */
const DRY_RUN_DELAY_MS = 450;

function RiskTriangle() {
  return <span aria-hidden="true" className="mt-[6px] size-2 shrink-0 bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]" />;
}

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
  const reportFreedBytes = useAppStore((state) => state.reportFreedBytes);
  const refreshDiskUsage = useRefreshDiskUsage();

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

  useEffect(() => {
    if (!plan) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [plan, onClose]);

  if (!plan) {
    return null;
  }

  /** Artefatos mostram só o nome final (node_modules, target...); caches mostram o
   * caminho inteiro, já que o nome final sozinho pode não dizer nada (ex.: ".../vms/0"). */
  const isCache = plan.onConfirmedTargetIds.kind === "cache";

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
          reportFreedBytes(plan!.totalBytes);
          refreshDiskUsage();
          onConfirmed(plan!);
          onClose();
        },
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.15_0.01_60/0.4)] p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[480px] flex-col rounded-md border border-line-strong bg-surface shadow-pop"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5 px-5 pt-5">
          <h2 className="text-[15px] leading-[22px] font-semibold text-ink">{plan.title}</h2>
          <p className="text-ink-2" style={{ textWrap: "pretty" }}>
            {plan.lead}
          </p>
        </div>

        <div className="mt-4 flex flex-col border-t border-line px-5">
          {!previewReady ? (
            <p className="py-3 text-ink-3">Calculando o que vai sair da pasta...</p>
          ) : plan.preview.length === 0 ? (
            <p className="py-3 text-ink-3">Nada para remover.</p>
          ) : (
            <>
              {plan.preview.map((item) => (
                <div key={item.path} className="flex min-h-8 items-center gap-4 border-b border-line py-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={item.path}>
                    {isCache ? item.path : pathBasename(item.path)}
                  </span>
                  <span className="font-mono text-[12px] text-ink-2">{formatBytes(item.bytes)}</span>
                </div>
              ))}
              <div className="flex h-[34px] items-center gap-4">
                <span className="flex-1 font-semibold text-ink">Total</span>
                <span className="font-mono text-[12.5px] font-medium text-ink">{formatBytes(plan.totalBytes)}</span>
              </div>
            </>
          )}
        </div>

        {plan.riskText && previewReady && (
          <div className="mt-1 flex gap-[9px] border-t border-line px-5 pt-2.5 text-risk">
            <RiskTriangle />
            <span className="text-[12.5px]" style={{ textWrap: "pretty" }}>
              {plan.riskText}
            </span>
          </div>
        )}

        {plan.requiresNameConfirmation && previewReady && (
          <div className="mt-1 flex flex-col gap-2 border-t border-line px-5 pt-2.5">
            <div className="flex gap-[9px] text-risk">
              <RiskTriangle />
              <span className="text-[12.5px]" style={{ textWrap: "pretty" }}>
                Este projeto tem alterações não commitadas ou não enviadas. Digite{" "}
                <strong className="font-semibold">{plan.projectName}</strong> para confirmar.
              </span>
            </div>
            <input
              type="text"
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              placeholder={plan.projectName ?? ""}
              className="h-7 rounded-sm border border-line-strong bg-canvas px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shed"
            />
          </div>
        )}

        {cleanup.isError && <p className="px-5 pt-3 text-[12.5px] text-risk">Não foi possível concluir a limpeza.</p>}

        <div className="mt-5 flex justify-end gap-2 rounded-b-md border-t border-line bg-panel px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] rounded-sm border border-line-strong bg-surface px-3 text-[13px] text-ink transition-colors duration-100 hover:border-ink-3"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canConfirm || cleanup.isPending}
            onClick={handleConfirm}
            className="h-[30px] rounded-sm bg-shed px-3.5 text-[13px] font-semibold text-shed-ink transition-opacity duration-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shed"
          >
            {cleanup.isPending ? "Movendo..." : "Mover para Lixeira"}
          </button>
        </div>
      </div>
    </div>
  );
}
