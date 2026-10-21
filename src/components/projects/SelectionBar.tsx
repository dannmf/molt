import { formatBytes } from "../../lib/format";
import { useAppStore } from "../../store/useAppStore";
import { BroomIcon, XIcon } from "../icons/Icons";

interface SelectionBarProps {
  selectedCount: number;
  reclaimableBytes: number;
  onCleanSelected: () => void;
}

export function SelectionBar({ selectedCount, reclaimableBytes, onCleanSelected }: SelectionBarProps) {
  const clearSelection = useAppStore((state) => state.clearSelection);

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 border-t border-black/10 bg-white/90 px-6 py-3 backdrop-blur dark:border-white/10 dark:bg-neutral-900/90">
      <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
        <button type="button" onClick={clearSelection} aria-label="Cancelar seleção" className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/5">
          <XIcon className="h-4 w-4" />
        </button>
        {selectedCount} {selectedCount === 1 ? "projeto selecionado" : "projetos selecionados"}
      </div>
      <button
        type="button"
        onClick={onCleanSelected}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <BroomIcon className="h-4 w-4" />
        Liberar {formatBytes(reclaimableBytes)}
      </button>
    </div>
  );
}
