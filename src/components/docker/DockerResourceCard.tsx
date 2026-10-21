import { formatBytes } from "../../lib/format";
import type { CacheEntry } from "../../types";
import { RiskPill } from "../caches/RiskPill";
import { TargetIcon } from "../icons/Icons";

interface DockerResourceCardProps {
  entry: CacheEntry;
  onClean: (entry: CacheEntry) => void;
}

export function DockerResourceCard({ entry, onClean }: DockerResourceCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-medium text-neutral-900 dark:text-neutral-100" title={entry.label}>
          {entry.label}
        </p>
        <RiskPill risk={entry.risk} />
      </div>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">{entry.description}</p>

      <div className="mt-auto flex items-center justify-between">
        <span className="tabular-nums text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {formatBytes(entry.bytes)}
        </span>
        <button
          type="button"
          onClick={() => onClean(entry)}
          className="flex items-center gap-1.5 rounded-md border border-black/10 px-2.5 py-1.5 text-sm font-medium text-neutral-600 hover:bg-black/5 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
        >
          <TargetIcon className="h-4 w-4" />
          Limpar
        </button>
      </div>
    </div>
  );
}
