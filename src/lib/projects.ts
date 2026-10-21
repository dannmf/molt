import type { Project, ProjectKind } from "../types";
import { daysSince } from "./format";

export type ProjectSortKey = "reclaimableBytes" | "totalBytes" | "lastModifiedAt" | "name";
export type SortDirection = "asc" | "desc";

/** Ordena uma lista de projetos por uma das colunas da tabela. Não muta o array recebido. */
export function sortProjects(projects: Project[], key: ProjectSortKey, direction: SortDirection): Project[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...projects].sort((a, b) => {
    if (key === "name") {
      return sign * a.name.localeCompare(b.name, "pt-BR");
    }
    return sign * (a[key] - b[key]);
  });
}

export interface ProjectFilters {
  /** Kinds selecionados nos chips. Vazio = sem filtro de stack. */
  kinds: ProjectKind[];
  /** Só projetos parados há pelo menos N dias. `null` = sem filtro. */
  minIdleDays: number | null;
  /** Só projetos com pelo menos um artefato detectado. */
  onlyWithArtifacts: boolean;
}

export const EMPTY_FILTERS: ProjectFilters = {
  kinds: [],
  minIdleDays: null,
  onlyWithArtifacts: false,
};

/** Aplica os filtros da tela de Projetos. `now` é injetável para testes determinísticos. */
export function filterProjects(
  projects: Project[],
  filters: ProjectFilters,
  now: number = Date.now() / 1000,
): Project[] {
  return projects.filter((project) => {
    if (filters.kinds.length > 0 && !project.kinds.some((kind) => filters.kinds.includes(kind))) {
      return false;
    }
    if (filters.minIdleDays !== null && daysSince(project.lastModifiedAt, now) < filters.minIdleDays) {
      return false;
    }
    if (filters.onlyWithArtifacts && project.artifacts.length === 0) {
      return false;
    }
    return true;
  });
}

export interface ProjectTotals {
  totalBytes: number;
  reclaimableBytes: number;
}

/** Soma `totalBytes`/`reclaimableBytes` de uma lista de projetos, para o resumo do topo. */
export function computeTotals(projects: Project[]): ProjectTotals {
  return projects.reduce<ProjectTotals>(
    (acc, project) => ({
      totalBytes: acc.totalBytes + project.totalBytes,
      reclaimableBytes: acc.reclaimableBytes + project.reclaimableBytes,
    }),
    { totalBytes: 0, reclaimableBytes: 0 },
  );
}

/** Todos os `ProjectKind` presentes na lista, na ordem em que aparecem, sem duplicatas. */
export function distinctKinds(projects: Project[]): ProjectKind[] {
  const seen = new Set<ProjectKind>();
  for (const project of projects) {
    for (const kind of project.kinds) {
      seen.add(kind);
    }
  }
  return [...seen];
}
