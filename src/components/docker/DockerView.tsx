import { useState } from "react";

import { useDockerQuery, useRemoveDockerEntry } from "../../hooks/useDockerQuery";
import type { CacheEntry } from "../../types";
import { ScanningAnimation } from "../shared/ScanningAnimation";
import { DockerConfirmModal } from "./DockerConfirmModal";
import { DockerResourceCard } from "./DockerResourceCard";
import { RunningContainerCard } from "./RunningContainerCard";

function Section({
  title,
  entries,
  onClean,
}: {
  title: string;
  entries: CacheEntry[];
  onClean: (entry: CacheEntry) => void;
}) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {entries.map((entry) => (
          <DockerResourceCard key={entry.id} entry={entry} onClean={onClean} />
        ))}
      </div>
    </div>
  );
}

export function DockerView() {
  const { data: summary, isPending } = useDockerQuery();
  const removeDockerEntry = useRemoveDockerEntry();
  const [target, setTarget] = useState<CacheEntry | null>(null);

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-sm text-neutral-500 dark:text-neutral-400">
        <ScanningAnimation />
        Verificando Docker...
      </div>
    );
  }

  if (!summary?.available) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-20 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Docker não encontrado ou o daemon não está em execução.
      </div>
    );
  }

  const buildCacheEntries = summary.buildCache ? [summary.buildCache] : [];
  const hasAnythingToClean =
    summary.danglingImages.length > 0 ||
    summary.stoppedContainers.length > 0 ||
    summary.orphanVolumes.length > 0 ||
    buildCacheEntries.length > 0;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-6 py-6">
      {summary.runningContainers.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Containers em execução</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {summary.runningContainers.map((container) => (
              <RunningContainerCard key={container.id} container={container} />
            ))}
          </div>
        </div>
      )}

      {!hasAnythingToClean && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nenhum recurso Docker reclamável encontrado.</p>
      )}

      <Section title="Imagens penduradas" entries={summary.danglingImages} onClean={setTarget} />
      <Section title="Containers parados" entries={summary.stoppedContainers} onClean={setTarget} />
      <Section title="Volumes órfãos" entries={summary.orphanVolumes} onClean={setTarget} />
      <Section title="Build cache" entries={buildCacheEntries} onClean={setTarget} />

      <DockerConfirmModal entry={target} onClose={() => setTarget(null)} onConfirmed={(id) => removeDockerEntry(id)} />
    </div>
  );
}
