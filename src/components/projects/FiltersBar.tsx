import type { ProjectKind } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { StackFilterChip } from "./StackBadge";

const IDLE_OPTIONS = [
  { label: "Qualquer data", value: null },
  { label: "Parado há 7+ dias", value: 7 },
  { label: "Parado há 30+ dias", value: 30 },
  { label: "Parado há 90+ dias", value: 90 },
];

interface FiltersBarProps {
  availableKinds: ProjectKind[];
}

export function FiltersBar({ availableKinds }: FiltersBarProps) {
  const filters = useAppStore((state) => state.filters);
  const toggleKindFilter = useAppStore((state) => state.toggleKindFilter);
  const setMinIdleDays = useAppStore((state) => state.setMinIdleDays);
  const setOnlyWithArtifacts = useAppStore((state) => state.setOnlyWithArtifacts);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-black/10 px-6 py-3 dark:border-white/10">
      <div className="flex flex-wrap gap-1.5">
        {availableKinds.map((kind) => (
          <StackFilterChip key={kind} kind={kind} active={filters.kinds.includes(kind)} onToggle={toggleKindFilter} />
        ))}
      </div>

      <select
        value={filters.minIdleDays ?? ""}
        onChange={(event) => setMinIdleDays(event.target.value === "" ? null : Number(event.target.value))}
        className="rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-sm text-neutral-600 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400"
      >
        {IDLE_OPTIONS.map((option) => (
          <option key={option.label} value={option.value ?? ""}>
            {option.label}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
        <input
          type="checkbox"
          checked={filters.onlyWithArtifacts}
          onChange={(event) => setOnlyWithArtifacts(event.target.checked)}
          className="rounded"
        />
        Só com artefatos
      </label>
    </div>
  );
}
