import { kindLabel } from "../../lib/projectKind";
import { filterProjects } from "../../lib/projects";
import { useAppStore } from "../../store/useAppStore";
import type { Project, ProjectKind } from "../../types";
import { Checkbox } from "../shared/Checkbox";
import { Select, type SelectOption } from "../shared/Select";

type AgeValue = "any" | "1m" | "6m" | "1y" | "2y";

const AGE_DAYS: Record<AgeValue, number | null> = {
  any: null,
  "1m": 30,
  "6m": 182,
  "1y": 365,
  "2y": 730,
};

const AGE_LABELS: Record<AgeValue, string> = {
  any: "Qualquer data",
  "1m": "Mais de 1 mês",
  "6m": "Mais de 6 meses",
  "1y": "Mais de 1 ano",
  "2y": "Mais de 2 anos",
};

function ageValueForDays(days: number | null): AgeValue {
  const match = (Object.keys(AGE_DAYS) as AgeValue[]).find((value) => AGE_DAYS[value] === days);
  return match ?? "any";
}

interface FiltersBarProps {
  projects: Project[];
  availableKinds: ProjectKind[];
}

export function FiltersBar({ projects, availableKinds }: FiltersBarProps) {
  const filters = useAppStore((state) => state.filters);
  const toggleKindFilter = useAppStore((state) => state.toggleKindFilter);
  const setMinIdleDays = useAppStore((state) => state.setMinIdleDays);
  const setOnlyWithArtifacts = useAppStore((state) => state.setOnlyWithArtifacts);

  const ageOptions: SelectOption<AgeValue>[] = (Object.keys(AGE_DAYS) as AgeValue[]).map((value) => ({
    value,
    label: AGE_LABELS[value],
    meta: String(filterProjects(projects, { ...filters, minIdleDays: AGE_DAYS[value] }).length),
  }));

  const stackCounts = availableKinds
    .map((kind) => ({ kind, count: filterProjects(projects, { ...filters, kinds: [kind] }).length }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-7 py-3">
      <Select
        label="Modificado"
        value={ageValueForDays(filters.minIdleDays)}
        onChange={(value) => setMinIdleDays(AGE_DAYS[value])}
        options={ageOptions}
      />

      <Checkbox checked={filters.onlyWithArtifacts} onChange={(event) => setOnlyWithArtifacts(event.target.checked)} label="Só com artefatos" />

      <span aria-hidden="true" className="h-4 w-px bg-line" />

      <div className="flex flex-wrap gap-0.5">
        {stackCounts.map(({ kind, count }) => {
          const active = filters.kinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKindFilter(kind)}
              className={`inline-flex items-center gap-1.5 rounded-xs px-[7px] py-0.5 text-[12px] transition-colors duration-100 ${
                active ? "bg-select text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              <span>{kindLabel(kind)}</span>
              <span className="font-mono text-[11px] text-ink-3">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
