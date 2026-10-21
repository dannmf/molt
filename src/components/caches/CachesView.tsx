import { useMemo, useState } from "react";

import { useCachesQuery, useRemoveCacheEntry } from "../../hooks/useCachesQuery";
import { planForCache, type CleanupPlan } from "../../lib/cleanupPlan";
import type { CacheEntry } from "../../types";
import { ConfirmCleanupModal } from "../shared/ConfirmCleanupModal";
import { CacheCard } from "./CacheCard";

function groupByTool(caches: CacheEntry[]): Map<string, CacheEntry[]> {
  const groups = new Map<string, CacheEntry[]>();
  for (const cache of caches) {
    const group = groups.get(cache.tool) ?? [];
    group.push(cache);
    groups.set(cache.tool, group);
  }
  return groups;
}

export function CachesView() {
  const { data: caches } = useCachesQuery();
  const removeCacheEntry = useRemoveCacheEntry();
  const [plan, setPlan] = useState<CleanupPlan | null>(null);

  const groups = useMemo(() => groupByTool(caches ?? []), [caches]);

  function handleConfirmed(confirmedPlan: CleanupPlan) {
    if (confirmedPlan.onConfirmedTargetIds.kind === "cache") {
      removeCacheEntry(confirmedPlan.onConfirmedTargetIds.cacheId);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      {groups.size === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nenhuma cache encontrada.</p>
      )}

      <div className="flex flex-col gap-6">
        {[...groups.entries()].map(([tool, entries]) => (
          <section key={tool}>
            <h2 className="mb-2 text-sm font-semibold text-neutral-500 dark:text-neutral-400">{tool}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((cache) => (
                <CacheCard key={cache.id} cache={cache} onClean={(entry) => setPlan(planForCache(entry))} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <ConfirmCleanupModal plan={plan} onClose={() => setPlan(null)} onConfirmed={handleConfirmed} />
    </div>
  );
}
