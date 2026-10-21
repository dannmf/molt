import { useDockerCleanup } from "../../hooks/useDockerCleanup";
import { formatBytes } from "../../lib/format";
import type { CacheEntry } from "../../types";

interface DockerConfirmModalProps {
  entry: CacheEntry | null;
  onClose: () => void;
  onConfirmed: (id: string) => void;
}

export function DockerConfirmModal({ entry, onClose, onConfirmed }: DockerConfirmModalProps) {
  const cleanup = useDockerCleanup();

  if (!entry) {
    return null;
  }

  function handleConfirm() {
    cleanup.mutate(entry!.id, {
      onSuccess: () => {
        onConfirmed(entry!.id);
        onClose();
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Limpar "{entry.label}"</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{entry.description}</p>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">Espaço a liberar</span>
          <span className="tabular-nums font-semibold text-neutral-900 dark:text-neutral-100">
            {formatBytes(entry.bytes)}
          </span>
        </div>

        {cleanup.isError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">Não foi possível concluir a limpeza.</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={cleanup.isPending}
            onClick={handleConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:bg-red-700"
          >
            {cleanup.isPending ? "Limpando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
