import { formatBytes, pathBasename } from "../../lib/format";
import type { CacheEntry } from "../../types";
import { TargetIcon } from "../icons/Icons";
import { RiskPill } from "./RiskPill";

interface CacheCardProps {
  cache: CacheEntry;
  onClean: (cache: CacheEntry) => void;
}

export function CacheCard({ cache, onClean }: CacheCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-neutral-900 dark:text-neutral-100">{cache.label}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500">{cache.tool}</p>
        </div>
        <RiskPill risk={cache.risk} />
      </div>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">{cache.description}</p>

      {cache.paths.length > 0 && (
        <ul className="flex max-h-28 flex-col gap-1.5 overflow-y-auto rounded-md border border-black/5 bg-black/[0.02] p-2 dark:border-white/5 dark:bg-white/[0.03]">
          {cache.paths.map((path) => (
            <li key={path} className="min-w-0">
              <p className="truncate text-xs font-medium text-neutral-700 dark:text-neutral-300">{pathBasename(path)}</p>
              <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-500" title={path}>
                {path}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between">
        <span className="tabular-nums text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {formatBytes(cache.bytes)}
        </span>
        <button
          type="button"
          onClick={() => onClean(cache)}
          className="flex items-center gap-1.5 rounded-md border border-black/10 px-2.5 py-1.5 text-sm font-medium text-neutral-600 hover:bg-black/5 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
        >
          <TargetIcon className="h-4 w-4" />
          Limpar
        </button>
      </div>
    </div>
  );
}
