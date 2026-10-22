import { formatBytes, formatRelativeDate } from "../../lib/format";
import type { ProjectTotals } from "../../lib/projects";
import { useAppStore } from "../../store/useAppStore";

interface ProjectsSummaryBarProps {
  totals: ProjectTotals;
  projectCount: number;
}

export function ProjectsSummaryBar({ totals, projectCount }: ProjectsSummaryBarProps) {
  const setView = useAppStore((state) => state.setView);
  const roots = useAppStore((state) => state.roots);
  const lastScanAt = useAppStore((state) => state.lastScanAt);

  const pct = totals.totalBytes > 0 ? Math.round((totals.reclaimableBytes / totals.totalBytes) * 100) : 0;

  return (
    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line px-7 pt-[26px] pb-5">
      <div>
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-ink">Projetos</h1>
        <p className="mt-1 font-mono text-[11.5px] text-ink-3">
          {lastScanAt !== null ? `varrido ${formatRelativeDate(lastScanAt)}` : "nunca varrido"} · {roots.length}{" "}
          {roots.length === 1 ? "pasta raiz" : "pastas raiz"} · {projectCount} {projectCount === 1 ? "projeto" : "projetos"}
        </p>
      </div>

      <div className="flex items-end gap-8">
        <div>
          <p className="text-xs text-ink-3">Recuperável</p>
          <p className="mt-0.5 font-mono text-[22px] leading-7 font-medium text-ink">{formatBytes(totals.reclaimableBytes)}</p>
          <div className="mt-1.5 h-[3px] w-[148px] bg-line">
            <div className="h-full bg-shed" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div>
          <p className="text-xs text-ink-3">Ocupado</p>
          <p className="mt-0.5 font-mono text-[22px] leading-7 text-ink-2">{formatBytes(totals.totalBytes)}</p>
        </div>
        <button
          type="button"
          onClick={() => setView("onboarding")}
          className="h-[30px] shrink-0 rounded-sm border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors duration-100 hover:border-ink-3"
        >
          Nova varredura
        </button>
      </div>
    </div>
  );
}
