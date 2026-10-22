import { useEffect, useRef, useState } from "react";

import { revealInFinder } from "../../api/client";
import { formatBytes, formatRelativeDate } from "../../lib/format";
import { kindLabel } from "../../lib/projectKind";
import type { ProjectSortKey, SortDirection } from "../../lib/projects";
import { useAppStore } from "../../store/useAppStore";
import type { GitInfo, Project } from "../../types";
import { Checkbox } from "../shared/Checkbox";
import { ChevronDownIcon, ChevronUpIcon } from "../icons/Icons";

/** Mesmas colunas no cabeçalho e nas linhas. */
const PROJECT_GRID = "grid grid-cols-[28px_minmax(0,1fr)_136px_128px_96px_104px] items-center gap-x-4";

function riskText(git: GitInfo | null): string {
  if (!git) {
    return "";
  }
  const parts: string[] = [];
  if (git.dirty) {
    parts.push("alterações não commitadas");
  }
  if (git.unpushedCommits > 0) {
    parts.push(git.unpushedCommits === 1 ? "1 commit não enviado" : `${git.unpushedCommits} commits não enviados`);
  }
  return parts.join(" · ");
}

interface SortButtonProps {
  label: string;
  sortKey: ProjectSortKey;
  activeKey: ProjectSortKey;
  direction: SortDirection;
  onSort: (key: ProjectSortKey) => void;
}

function SortButton({ label, sortKey, activeKey, direction, onSort }: SortButtonProps) {
  const isActive = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 ${isActive ? "text-ink" : "hover:text-ink"}`}
    >
      {label}
      {isActive && (direction === "asc" ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />)}
    </button>
  );
}

function RowMenu({ onReveal, onIgnore }: { onReveal: () => void; onIgnore: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Mais ações"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid size-6 place-items-center rounded-sm text-ink-3 hover:bg-line hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shed"
      >
        ···
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute top-[calc(100%+4px)] right-0 z-50 min-w-[168px] rounded-md border border-line-strong bg-surface p-1 shadow-pop"
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onReveal();
              }}
              className="flex h-7 w-full items-center rounded-xs px-2 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink"
            >
              Mostrar no Finder
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onIgnore();
              }}
              className="flex h-7 w-full items-center rounded-xs px-2 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink"
            >
              Ignorar projeto
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

interface ProjectsTableProps {
  projects: Project[];
  onCleanArtifacts: (project: Project) => void;
  onIgnoreProject: (project: Project) => void;
}

export function ProjectsTable({ projects, onCleanArtifacts, onIgnoreProject }: ProjectsTableProps) {
  const sortKey = useAppStore((state) => state.sortKey);
  const sortDirection = useAppStore((state) => state.sortDirection);
  const setSort = useAppStore((state) => state.setSort);
  const selectedIds = useAppStore((state) => state.selectedIds);
  const toggleSelected = useAppStore((state) => state.toggleSelected);
  const setSelected = useAppStore((state) => state.setSelected);
  const clearSelection = useAppStore((state) => state.clearSelection);

  const cleanableProjects = projects.filter((project) => project.artifacts.length > 0);
  const allCleanableSelected = cleanableProjects.length > 0 && cleanableProjects.every((project) => selectedIds.has(project.id));
  const someCleanableSelected = cleanableProjects.some((project) => selectedIds.has(project.id));

  function toggleSelectAll() {
    if (allCleanableSelected) {
      clearSelection();
    } else {
      setSelected(cleanableProjects.map((project) => project.id));
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[780px]">
        <div className={`${PROJECT_GRID} h-[34px] border-b border-line px-7 text-xs text-ink-3`}>
          <div role="columnheader">
            <Checkbox
              checked={allCleanableSelected}
              indeterminate={someCleanableSelected && !allCleanableSelected}
              disabled={cleanableProjects.length === 0}
              onChange={toggleSelectAll}
              aria-label="Selecionar todos"
              className="-m-2 p-2"
            />
          </div>
          <div role="columnheader">
            <SortButton label="Projeto" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={setSort} />
          </div>
          <div role="columnheader">Stack</div>
          <div role="columnheader" className="flex justify-end">
            <SortButton label="Recuperável" sortKey="reclaimableBytes" activeKey={sortKey} direction={sortDirection} onSort={setSort} />
          </div>
          <div role="columnheader">
            <SortButton label="Modificado" sortKey="lastModifiedAt" activeKey={sortKey} direction={sortDirection} onSort={setSort} />
          </div>
          <div role="columnheader" />
        </div>

        {projects.map((project) => {
          const selected = selectedIds.has(project.id);
          const cleanable = project.artifacts.length > 0;
          const risk = riskText(project.git);
          const pct = project.totalBytes > 0 ? Math.round((project.reclaimableBytes / project.totalBytes) * 100) : 0;
          const cleanLabel = !cleanable ? "Limpo" : risk ? "Limpar…" : "Limpar";

          return (
            <div
              key={project.id}
              role="row"
              aria-selected={selected}
              className={`group ${PROJECT_GRID} border-b border-line px-7 py-2.5 hover:bg-hover aria-selected:bg-select`}
            >
              <div role="cell">
                <Checkbox
                  checked={selected}
                  disabled={!cleanable}
                  onChange={() => toggleSelected(project.id)}
                  aria-label={`Selecionar ${project.name}`}
                  className="-m-2 p-2"
                />
              </div>

              <div role="cell" className="min-w-0">
                <p className="truncate text-[13px] leading-5 font-semibold text-ink">{project.name}</p>
                <p className="truncate font-mono text-[11.5px] leading-[17px] text-ink-3" title={project.path}>
                  {project.path}
                </p>
                {risk && (
                  <div className="mt-[3px] flex items-center gap-[7px] font-mono text-[11.5px] leading-[17px] text-risk">
                    <span aria-hidden="true" className="size-[7px] shrink-0 bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
                    {risk}
                  </div>
                )}
              </div>

              <div role="cell" className="truncate font-mono text-[12px] text-ink-2">
                {project.kinds.map(kindLabel).join(", ")}
              </div>

              <div role="cell" className="text-right">
                <p className="font-mono text-[13px] font-medium tabular-nums text-ink">
                  {project.reclaimableBytes > 0 ? formatBytes(project.reclaimableBytes) : "—"}
                </p>
                <div className="mt-0.5 flex items-center justify-end gap-2">
                  <div className="h-[3px] w-14 bg-line" aria-hidden="true">
                    <div className="h-full bg-shed" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono text-[11px] text-ink-3">de {formatBytes(project.totalBytes)}</span>
                </div>
              </div>

              <div role="cell" className="text-[12.5px] text-ink-2">
                {formatRelativeDate(project.lastModifiedAt)}
              </div>

              <div
                role="cell"
                className="flex justify-end gap-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <button
                  type="button"
                  onClick={() => onCleanArtifacts(project)}
                  disabled={!cleanable}
                  className="h-6 rounded-sm border border-line-strong bg-surface px-2 text-[12px] text-ink transition-colors duration-100 hover:enabled:border-ink-3 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shed"
                >
                  {cleanLabel}
                </button>
                <RowMenu onReveal={() => void revealInFinder(project.path)} onIgnore={() => onIgnoreProject(project)} />
              </div>
            </div>
          );
        })}

        {projects.length === 0 && <div className="px-7 py-10 text-center text-[13px] text-ink-3">Nenhum projeto com esses filtros.</div>}
      </div>
    </div>
  );
}
