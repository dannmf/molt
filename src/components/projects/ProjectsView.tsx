import { useMemo, useState } from "react";

import { useProjectsCacheActions, useProjectsQuery } from "../../hooks/useProjectsQuery";
import { computeTotals, distinctKinds, filterProjects, sortProjects } from "../../lib/projects";
import { planForArtifacts, planForProjectTrash, type CleanupPlan } from "../../lib/cleanupPlan";
import { useAppStore } from "../../store/useAppStore";
import type { Project } from "../../types";
import { ConfirmCleanupModal } from "../shared/ConfirmCleanupModal";
import { FiltersBar } from "./FiltersBar";
import { ProjectsSummaryBar } from "./ProjectsSummaryBar";
import { ProjectsTable } from "./ProjectsTable";
import { SelectionBar } from "./SelectionBar";

export function ProjectsView() {
  const { data: projects } = useProjectsQuery();
  const { clearArtifacts, removeProjects } = useProjectsCacheActions();
  const sortKey = useAppStore((state) => state.sortKey);
  const sortDirection = useAppStore((state) => state.sortDirection);
  const filters = useAppStore((state) => state.filters);
  const selectedIds = useAppStore((state) => state.selectedIds);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const excludePath = useAppStore((state) => state.excludePath);

  const [plan, setPlan] = useState<CleanupPlan | null>(null);

  const availableKinds = useMemo(() => distinctKinds(projects), [projects]);
  const filtered = useMemo(() => filterProjects(projects, filters), [projects, filters]);
  const sorted = useMemo(() => sortProjects(filtered, sortKey, sortDirection), [filtered, sortKey, sortDirection]);
  const totals = useMemo(() => computeTotals(projects), [projects]);

  const selectedProjects = projects.filter((project) => selectedIds.has(project.id));
  const selectedReclaimableBytes = computeTotals(selectedProjects).reclaimableBytes;

  function handleCleanArtifacts(project: Project) {
    setPlan(planForArtifacts([project]));
  }

  function handleTrashProject(project: Project) {
    setPlan(planForProjectTrash(project));
  }

  function handleIgnoreProject(project: Project) {
    excludePath(project.path);
    removeProjects([project.id]);
  }

  function handleCleanSelected() {
    setPlan(planForArtifacts(selectedProjects));
  }

  function handleConfirmed(confirmedPlan: CleanupPlan) {
    const target = confirmedPlan.onConfirmedTargetIds;
    if (target.kind === "artifacts") {
      clearArtifacts(target.projectIds);
      clearSelection();
    } else if (target.kind === "project") {
      removeProjects(target.projectIds);
      clearSelection();
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <ProjectsSummaryBar totals={totals} projectCount={projects.length} />
      <FiltersBar availableKinds={availableKinds} />
      <div className="flex-1 overflow-y-auto">
        <ProjectsTable
          projects={sorted}
          onCleanArtifacts={handleCleanArtifacts}
          onTrashProject={handleTrashProject}
          onIgnoreProject={handleIgnoreProject}
        />
      </div>
      <SelectionBar selectedCount={selectedIds.size} reclaimableBytes={selectedReclaimableBytes} onCleanSelected={handleCleanSelected} />

      <ConfirmCleanupModal plan={plan} onClose={() => setPlan(null)} onConfirmed={handleConfirmed} />
    </div>
  );
}
