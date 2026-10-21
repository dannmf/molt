import { useState } from "react";

import { useCachesQuery, useRemoveCacheEntry } from "../../hooks/useCachesQuery";
import { planForCache, type CleanupPlan } from "../../lib/cleanupPlan";
import { ConfirmCleanupModal } from "../shared/ConfirmCleanupModal";
import { ScanningAnimation } from "../shared/ScanningAnimation";
import { CacheCard } from "./CacheCard";

export function CachesView() {
  const { data: caches, isPending } = useCachesQuery();
  const removeCacheEntry = useRemoveCacheEntry();
  const [plan, setPlan] = useState<CleanupPlan | null>(null);

  const entries = caches ?? [];

  function handleConfirmed(confirmedPlan: CleanupPlan) {
    if (confirmedPlan.onConfirmedTargetIds.kind === "cache") {
      removeCacheEntry(confirmedPlan.onConfirmedTargetIds.cacheId);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      {isPending && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-neutral-500 dark:text-neutral-400">
          <ScanningAnimation />
          Verificando caches...
        </div>
      )}

      {!isPending && entries.length === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nenhuma cache encontrada.</p>
      )}

      {!isPending && entries.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map((cache) => (
            <CacheCard key={cache.id} cache={cache} onClean={(entry) => setPlan(planForCache(entry))} />
          ))}
        </div>
      )}

      <ConfirmCleanupModal plan={plan} onClose={() => setPlan(null)} onConfirmed={handleConfirmed} />
    </div>
  );
}
