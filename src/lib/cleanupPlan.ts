import type { CacheEntry, CleanupTarget, Project } from "../types";

export interface CleanupPreviewItem {
  path: string;
  bytes: number;
}

/** O que o modal de confirmação precisa para mostrar o dry run e montar o pedido real. */
export interface CleanupPlan {
  title: string;
  targets: CleanupTarget[];
  preview: CleanupPreviewItem[];
  totalBytes: number;
  requiresNameConfirmation: boolean;
  projectName: string | null;
  /** Usado só para a atualização local otimista após confirmar (ver `useProjectsCacheActions`/`useRemoveCacheEntry`). */
  onConfirmedTargetIds:
    | { kind: "artifacts"; projectIds: string[] }
    | { kind: "project"; projectIds: string[] }
    | { kind: "cache"; cacheId: string };
}

function isProjectDirty(project: Project): boolean {
  return Boolean(project.git?.dirty || (project.git?.unpushedCommits ?? 0) > 0);
}

/** Plano para limpar só os artefatos (node_modules, target, etc.) de um ou mais projetos. */
export function planForArtifacts(projects: Project[]): CleanupPlan {
  const preview = projects.flatMap((project) =>
    project.artifacts.map((artifact) => ({ path: artifact.path, bytes: artifact.bytes })),
  );
  const targets: CleanupTarget[] = preview.map((item) => ({ type: "artifact", path: item.path }));
  const totalBytes = preview.reduce((sum, item) => sum + item.bytes, 0);
  const title =
    projects.length === 1
      ? `Limpar artefatos de "${projects[0]?.name}"`
      : `Limpar artefatos de ${projects.length} projetos`;

  return {
    title,
    targets,
    preview,
    totalBytes,
    requiresNameConfirmation: false,
    projectName: null,
    onConfirmedTargetIds: { kind: "artifacts", projectIds: projects.map((project) => project.id) },
  };
}

/** Plano para mover um projeto inteiro para a Lixeira. Exige nome digitado se o git estiver sujo. */
export function planForProjectTrash(project: Project): CleanupPlan {
  const dirty = isProjectDirty(project);
  return {
    title: `Mover "${project.name}" para a Lixeira`,
    targets: [{ type: "project", path: project.path }],
    preview: [{ path: project.path, bytes: project.totalBytes }],
    totalBytes: project.totalBytes,
    requiresNameConfirmation: dirty,
    projectName: dirty ? project.name : null,
    onConfirmedTargetIds: { kind: "project", projectIds: [project.id] },
  };
}

/** Plano para limpar uma entrada do catálogo de caches. */
export function planForCache(cache: CacheEntry): CleanupPlan {
  const preview =
    cache.paths.length > 0
      ? cache.paths.map((path) => ({ path, bytes: Math.round(cache.bytes / cache.paths.length) }))
      : [{ path: cache.tool, bytes: cache.bytes }];

  return {
    title: `Limpar ${cache.label}`,
    targets: [{ type: "cache", id: cache.id }],
    preview,
    totalBytes: cache.bytes,
    requiresNameConfirmation: false,
    projectName: null,
    onConfirmedTargetIds: { kind: "cache", cacheId: cache.id },
  };
}
