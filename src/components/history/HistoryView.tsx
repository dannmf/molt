import { useState } from "react";

import { useCleanupHistoryQuery } from "../../hooks/useCleanupHistoryQuery";
import { parseHistoryEntry } from "../../lib/cleanupHistory";
import { formatBytes, formatHistoryTimestamp } from "../../lib/format";
import { ScanningAnimation } from "../shared/ScanningAnimation";
import type { CleanupHistoryEntry } from "../../types";

const HISTORY_GRID = "grid grid-cols-[150px_104px_minmax(0,1fr)_88px] gap-x-5";

function ResultMarker({ success }: { success: boolean }) {
  if (success) {
    return <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-current text-ink" />;
  }
  return (
    <span
      aria-hidden="true"
      className="size-[7px] shrink-0 bg-current text-risk [clip-path:polygon(50%_0,100%_100%,0_100%)]"
    />
  );
}

function HistoryRow({ entry }: { entry: CleanupHistoryEntry }) {
  const [showDetail, setShowDetail] = useState(false);
  const { target, reason, freedBytes } = parseHistoryEntry(entry.message);

  return (
    <div className={`${HISTORY_GRID} border-b border-line px-7 py-[11px] [align-items:start]`}>
      <p className="font-mono text-[11.5px] text-ink-3">{formatHistoryTimestamp(entry.timestamp)}</p>

      <div className="flex items-center gap-[7px] text-[13px]">
        <ResultMarker success={entry.success} />
        <span className={entry.success ? "text-ink" : "text-risk"}>{entry.success ? "removido" : "falhou"}</span>
      </div>

      <div className="min-w-0">
        <p className="truncate font-mono text-[12px] text-ink-2" title={target}>
          {target}
        </p>
        {reason && <p className="mt-0.5 text-[12.5px] text-ink-2">{reason}</p>}
        <button
          type="button"
          onClick={() => setShowDetail((value) => !value)}
          className="mt-1 text-[12px] text-ink-3 underline hover:text-ink-2"
        >
          {showDetail ? "ocultar detalhe técnico" : "detalhe técnico"}
        </button>
        {showDetail && (
          <pre className="mt-1.5 rounded-sm border border-line bg-panel px-[10px] py-2 font-mono text-[11.5px] leading-[17px] whitespace-pre-wrap text-ink-2">
            {entry.message}
          </pre>
        )}
      </div>

      <p className="text-right font-mono text-[12px] text-ink-2">{freedBytes !== null ? formatBytes(freedBytes) : "—"}</p>
    </div>
  );
}

export function HistoryView() {
  const { data: entries, isPending } = useCleanupHistoryQuery();
  const items = entries ?? [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-line px-7 pt-[26px] pb-5">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-ink">Histórico</h1>
        <p className="mt-1 font-mono text-[11.5px] text-ink-3">registro das últimas limpezas executadas</p>
      </div>

      {isPending && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-[13px] text-ink-3">
          <ScanningAnimation />
          Lendo histórico...
        </div>
      )}

      {!isPending && items.length === 0 && <p className="px-7 py-10 text-center text-[13px] text-ink-3">Nenhuma limpeza registrada ainda.</p>}

      {!isPending && items.length > 0 && (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className={`${HISTORY_GRID} h-[34px] border-b border-line px-7 text-xs text-ink-3`}>
              <div role="columnheader">Quando</div>
              <div role="columnheader">Resultado</div>
              <div role="columnheader">Alvo</div>
              <div role="columnheader" className="text-right">
                Tamanho
              </div>
            </div>

            {items.map((entry, index) => (
              <HistoryRow key={`${entry.timestamp}-${index}`} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
