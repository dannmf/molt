import { formatBytes } from "../../lib/format";
import { useAppStore } from "../../store/useAppStore";

interface SelectionBarProps {
  selectedCount: number;
  reclaimableBytes: number;
  onCleanSelected: () => void;
}

export function SelectionBar({ selectedCount, reclaimableBytes, onCleanSelected }: SelectionBarProps) {
  const clearSelection = useAppStore((state) => state.clearSelection);

  return (
    <div className="flex min-h-[52px] items-center justify-between gap-4 border-t border-line bg-panel px-7 py-2.5">
      {selectedCount === 0 ? (
        <p className="text-[13px] font-medium text-ink">Nenhum projeto selecionado</p>
      ) : (
        <p className="font-mono text-[12px] text-ink-2">
          {selectedCount} {selectedCount === 1 ? "projeto selecionado" : "projetos selecionados"} · {formatBytes(reclaimableBytes)}{" "}
          recuperáveis
        </p>
      )}

      {selectedCount > 0 && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={clearSelection} className="text-[13px] font-medium text-ink-2 hover:text-ink">
            Limpar seleção
          </button>
          <button
            type="button"
            onClick={onCleanSelected}
            className="h-[30px] rounded-sm bg-shed px-[14px] text-[13px] font-semibold text-shed-ink transition-opacity duration-100 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shed"
          >
            Mover para Lixeira
          </button>
        </div>
      )}
    </div>
  );
}
