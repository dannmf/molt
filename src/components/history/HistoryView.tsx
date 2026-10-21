import { useCleanupHistoryQuery } from "../../hooks/useCleanupHistoryQuery";
import { formatRelativeDate } from "../../lib/format";
import { ScanningAnimation } from "../shared/ScanningAnimation";

export function HistoryView() {
  const { data: entries, isPending } = useCleanupHistoryQuery();

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      {isPending && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-neutral-500 dark:text-neutral-400">
          <ScanningAnimation />
          Lendo histórico...
        </div>
      )}

      {!isPending && (entries?.length ?? 0) === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nenhuma limpeza registrada ainda.</p>
      )}

      {!isPending && entries && entries.length > 0 && (
        <ul className="flex flex-col gap-2">
          {entries.map((entry, index) => (
            <li
              key={`${entry.timestamp}-${index}`}
              className="flex items-start gap-3 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-neutral-900"
            >
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${entry.success ? "bg-emerald-500" : "bg-red-500"}`}
                aria-hidden="true"
              />
              <div className="flex-1">
                <p className="text-neutral-800 dark:text-neutral-200">{entry.message}</p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-500">
                  {formatRelativeDate(entry.timestamp)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
