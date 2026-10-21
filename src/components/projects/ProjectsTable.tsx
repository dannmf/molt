import type { Project } from "../../types";
import { formatBytes, formatRelativeDate } from "../../lib/format";
import type { ProjectSortKey, SortDirection } from "../../lib/projects";
import { useAppStore } from "../../store/useAppStore";
import { BroomIcon, ChevronDownIcon, ChevronUpIcon, FolderIcon, TrashIcon } from "../icons/Icons";
import { revealInFinder } from "../../api/client";
import { GitBadges } from "./GitBadges";
import { StackBadge } from "./StackBadge";

interface SortableHeaderProps {
  label: string;
  sortKey: ProjectSortKey;
  activeKey: ProjectSortKey;
  direction: SortDirection;
  onSort: (key: ProjectSortKey) => void;
  align?: "left" | "right";
}

function SortableHeader({ label, sortKey, activeKey, direction, onSort, align = "left" }: SortableHeaderProps) {
  const isActive = activeKey === sortKey;
  return (
    <th className={`px-3 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400 ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-neutral-800 dark:hover:text-neutral-200">
        {label}
        {isActive && (direction === "asc" ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />)}
      </button>
    </th>
  );
}

interface ProjectsTableProps {
  projects: Project[];
  onCleanArtifacts: (project: Project) => void;
  onTrashProject: (project: Project) => void;
}

export function ProjectsTable({ projects, onCleanArtifacts, onTrashProject }: ProjectsTableProps) {
  const sortKey = useAppStore((state) => state.sortKey);
  const sortDirection = useAppStore((state) => state.sortDirection);
  const setSort = useAppStore((state) => state.setSort);
  const selectedIds = useAppStore((state) => state.selectedIds);
  const toggleSelected = useAppStore((state) => state.toggleSelected);
  const setSelected = useAppStore((state) => state.setSelected);
  const clearSelection = useAppStore((state) => state.clearSelection);

  const allSelected = projects.length > 0 && projects.every((project) => selectedIds.has(project.id));

  function toggleSelectAll() {
    if (allSelected) {
      clearSelection();
    } else {
      setSelected(projects.map((project) => project.id));
    }
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 bg-white/90 backdrop-blur dark:bg-neutral-900/90">
        <tr className="border-b border-black/10 dark:border-white/10">
          <th className="w-10 px-3 py-2">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Selecionar todos" className="rounded" />
          </th>
          <SortableHeader label="Nome" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={setSort} />
          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">Stack</th>
          <SortableHeader label="Total" sortKey="totalBytes" activeKey={sortKey} direction={sortDirection} onSort={setSort} align="right" />
          <SortableHeader label="Recuperável" sortKey="reclaimableBytes" activeKey={sortKey} direction={sortDirection} onSort={setSort} align="right" />
          <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">Git</th>
          <SortableHeader label="Última modificação" sortKey="lastModifiedAt" activeKey={sortKey} direction={sortDirection} onSort={setSort} />
          <th className="px-3 py-2 text-right text-xs font-medium text-neutral-500 dark:text-neutral-400">Ações</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((project) => (
          <tr
            key={project.id}
            className="border-b border-black/5 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.02]"
          >
            <td className="px-3 py-2">
              <input
                type="checkbox"
                checked={selectedIds.has(project.id)}
                onChange={() => toggleSelected(project.id)}
                aria-label={`Selecionar ${project.name}`}
                className="rounded"
              />
            </td>
            <td className="px-3 py-2">
              <p className="font-medium text-neutral-900 dark:text-neutral-100">{project.name}</p>
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-500" title={project.path}>
                {project.path}
              </p>
            </td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-1">
                {project.kinds.map((kind) => (
                  <StackBadge key={kind} kind={kind} />
                ))}
              </div>
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
              {formatBytes(project.totalBytes)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
              {formatBytes(project.reclaimableBytes)}
            </td>
            <td className="px-3 py-2">
              <div className="flex flex-col gap-1">
                {project.git && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-500">
                    {project.git.lastCommitAt !== null ? formatRelativeDate(project.git.lastCommitAt) : "sem commits"}
                  </span>
                )}
                <GitBadges git={project.git} />
              </div>
            </td>
            <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">{formatRelativeDate(project.lastModifiedAt)}</td>
            <td className="px-3 py-2">
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => onCleanArtifacts(project)}
                  disabled={project.artifacts.length === 0}
                  title="Limpar artefatos"
                  className="rounded p-1.5 text-neutral-500 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-white/5"
                >
                  <BroomIcon />
                </button>
                <button
                  type="button"
                  onClick={() => onTrashProject(project)}
                  title="Mover projeto para a Lixeira"
                  className="rounded p-1.5 text-neutral-500 hover:bg-red-500/10 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
                >
                  <TrashIcon />
                </button>
                <button
                  type="button"
                  onClick={() => void revealInFinder(project.path)}
                  title="Revelar no Finder"
                  className="rounded p-1.5 text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5"
                >
                  <FolderIcon />
                </button>
              </div>
            </td>
          </tr>
        ))}
        {projects.length === 0 && (
          <tr>
            <td colSpan={8} className="px-3 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Nenhum projeto corresponde aos filtros.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
