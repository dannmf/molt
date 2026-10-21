import { kindBadge } from "../../lib/projectKind";
import type { ProjectKind } from "../../types";
import { Pill } from "../shared/Pill";

interface StackBadgeProps {
  kind: ProjectKind;
}

/** Badge não-interativo com o monograma da stack, usado nas linhas da tabela. */
export function StackBadge({ kind }: StackBadgeProps) {
  const badge = kindBadge(kind);
  return (
    <Pill className={badge.className} title={badge.label}>
      {badge.short}
    </Pill>
  );
}

interface StackFilterChipProps {
  kind: ProjectKind;
  active: boolean;
  onToggle: (kind: ProjectKind) => void;
}

/** Chip clicável usado na barra de filtros, para alternar um `ProjectKind`. */
export function StackFilterChip({ kind, active, onToggle }: StackFilterChipProps) {
  const badge = kindBadge(kind);
  return (
    <button
      type="button"
      onClick={() => onToggle(kind)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300"
          : "border-black/10 text-neutral-600 hover:border-black/20 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/20"
      }`}
    >
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${badge.className}`}>{badge.short}</span>
      {badge.label}
    </button>
  );
}
