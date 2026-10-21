import { formatBytes } from "../../lib/format";
import type { ProjectTotals } from "../../lib/projects";
import { useAppStore } from "../../store/useAppStore";
import { ScanIcon } from "../icons/Icons";

interface ProjectsSummaryBarProps {
  totals: ProjectTotals;
  projectCount: number;
}

export function ProjectsSummaryBar({ totals, projectCount }: ProjectsSummaryBarProps) {
  const setView = useAppStore((state) => state.setView);

  return (
    <div className="flex items-center justify-between gap-6 border-b border-black/10 bg-white/70 px-6 py-4 dark:border-white/10 dark:bg-neutral-900/60">
      <div className="flex gap-8">
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Projetos encontrados</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{projectCount}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Espaço ocupado</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
            {formatBytes(totals.totalBytes)}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Recuperável</p>
          <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatBytes(totals.reclaimableBytes)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setView("onboarding")}
        className="flex items-center gap-1.5 rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-black/5 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
      >
        <ScanIcon className="h-4 w-4" />
        Nova varredura
      </button>
    </div>
  );
}
