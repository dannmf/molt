import { useState } from "react";

import { useCachesQuery, useRemoveCacheEntry } from "../../hooks/useCachesQuery";
import { useCleanup } from "../../hooks/useCleanup";
import { riskGroup, RISK_ORDER, type RiskGroup } from "../../lib/cacheRisk";
import { planForCache, type CleanupPlan } from "../../lib/cleanupPlan";
import { formatBytes } from "../../lib/format";
import { useToastStore } from "../../store/useToastStore";
import type { CacheEntry } from "../../types";
import { ConfirmCleanupModal } from "../shared/ConfirmCleanupModal";
import { ScanningAnimation } from "../shared/ScanningAnimation";

const CACHE_GRID = "grid grid-cols-[minmax(0,170px)_minmax(0,1.3fr)_minmax(0,0.8fr)_80px_76px] items-center gap-x-4";

function RiskMarker({ marker, className }: { marker: RiskGroup["marker"]; className: string }) {
  if (marker === "circle") {
    return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full bg-current ${className}`} />;
  }
  if (marker === "square") {
    return <span aria-hidden="true" className={`size-2 shrink-0 bg-current ${className}`} />;
  }
  return (
    <span aria-hidden="true" className={`size-2 shrink-0 bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)] ${className}`} />
  );
}

function CacheRow({
  cache,
  maxBytes,
  cleaning,
  onClean,
}: {
  cache: CacheEntry;
  maxBytes: number;
  cleaning: boolean;
  onClean: (cache: CacheEntry) => void;
}) {
  const path = cache.paths[0] ?? cache.tool;
  const pct = maxBytes > 0 ? Math.round((cache.bytes / maxBytes) * 100) : 0;
  const label = cleaning ? "Limpando..." : cache.risk === "caution" ? "Limpar…" : "Limpar";

  return (
    <div className={`${CACHE_GRID} border-b border-line py-[11px] hover:bg-hover`}>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-ink">{cache.label}</p>
        <p className="truncate font-mono text-[11.5px] text-ink-3">{cache.tool}</p>
      </div>

      <p className="line-clamp-2 text-[13px] text-ink-2">{cache.description}</p>

      <div dir="rtl" className="min-w-0 overflow-hidden text-left font-mono text-[11.5px] text-ink-3" title={path}>
        <bdi dir="ltr">{path}</bdi>
      </div>

      <div className="text-right">
        <p className="font-mono text-[13px] font-medium tabular-nums text-ink">{formatBytes(cache.bytes)}</p>
        <div className="mt-1 ml-auto h-[3px] w-14 bg-line">
          <div className="h-full bg-shed" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={cleaning}
          onClick={() => onClean(cache)}
          className="h-[26px] rounded-sm border border-line-strong bg-surface px-2 text-[12px] text-ink transition-colors duration-100 hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shed"
        >
          {label}
        </button>
      </div>
    </div>
  );
}

export function CachesView() {
  const { data: caches, isPending } = useCachesQuery();
  const removeCacheEntry = useRemoveCacheEntry();
  const cleanup = useCleanup();
  const showToast = useToastStore((state) => state.showToast);
  const [plan, setPlan] = useState<CleanupPlan | null>(null);

  const entries = caches ?? [];
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const maxBytes = entries.reduce((max, entry) => Math.max(max, entry.bytes), 0);

  /** Caches "Atenção" sempre passam pelo diálogo; seguro/recriável limpa direto + toast (ver README). */
  function handleClean(cache: CacheEntry) {
    if (cache.risk === "caution") {
      setPlan(planForCache(cache));
      return;
    }
    cleanup.mutate(
      { targets: [{ type: "cache", id: cache.id }], allowDirtyGit: false },
      {
        onSuccess: () => {
          removeCacheEntry(cache.id);
          showToast(`${formatBytes(cache.bytes)} movidos para a Lixeira`);
        },
      },
    );
  }

  function handleConfirmed(confirmedPlan: CleanupPlan) {
    if (confirmedPlan.onConfirmedTargetIds.kind === "cache") {
      removeCacheEntry(confirmedPlan.onConfirmedTargetIds.cacheId);
    }
    showToast(`${formatBytes(confirmedPlan.totalBytes)} movidos para a Lixeira`);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line px-7 pt-[26px] pb-5">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-ink">Caches</h1>
          <p className="mt-1 font-mono text-[11.5px] text-ink-3">caches globais de ferramentas, fora das pastas de projeto</p>
        </div>
        <div>
          <p className="text-xs text-ink-3">Total em cache</p>
          <p className="mt-0.5 font-mono text-[22px] leading-7 font-medium text-ink">{formatBytes(totalBytes)}</p>
        </div>
      </div>

      {isPending && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-[13px] text-ink-3">
          <ScanningAnimation />
          Verificando caches...
        </div>
      )}

      {!isPending && entries.length === 0 && <p className="px-7 py-10 text-center text-[13px] text-ink-3">Nenhuma cache encontrada.</p>}

      {!isPending && entries.length > 0 && (
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {RISK_ORDER.map((risk) => {
              const groupEntries = entries.filter((entry) => entry.risk === risk);
              if (groupEntries.length === 0) {
                return null;
              }
              const group = riskGroup(risk);
              const groupBytes = groupEntries.reduce((sum, entry) => sum + entry.bytes, 0);

              return (
                <div key={risk} className="px-7 pt-6">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-line-strong pb-2.5">
                    <RiskMarker marker={group.marker} className={group.colorClass} />
                    <span className="text-sm font-semibold text-ink">{group.label}</span>
                    <span className="text-[12.5px] text-ink-3">{group.description}</span>
                    <span className="ml-auto font-mono text-[12px] text-ink-2">{formatBytes(groupBytes)}</span>
                  </div>

                  {groupEntries.map((cache) => {
                    const target = cleanup.variables?.targets[0];
                    const cleaning = cleanup.isPending && target?.type === "cache" && target.id === cache.id;
                    return <CacheRow key={cache.id} cache={cache} maxBytes={maxBytes} cleaning={cleaning} onClean={handleClean} />;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmCleanupModal plan={plan} onClose={() => setPlan(null)} onConfirmed={handleConfirmed} />
    </div>
  );
}
