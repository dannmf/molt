import type { CacheEntry, CleanupTarget, Project } from "../types";

export interface CleanupPreviewItem {
  path: string;
  bytes: number;
}

/** O que o modal de confirmação precisa para mostrar o dry run e montar o pedido real. */
export interface CleanupPlan {
  title: string;
  lead: string;
  targets: CleanupTarget[];
  preview: CleanupPreviewItem[];
  totalBytes: number;
  requiresNameConfirmation: boolean;
  projectName: string | null;
  /** Aviso informativo (marcador triângulo), não bloqueia a confirmação. Null quando não há risco a sinalizar. */
  riskText: string | null;
  /** Usado só para a atualização local otimista após confirmar (ver `useProjectsCacheActions`/`useRemoveCacheEntry`). */
  onConfirmedTargetIds:
    | { kind: "artifacts"; projectIds: string[] }
    | { kind: "project"; projectIds: string[] }
    | { kind: "cache"; cacheId: string };
}

function isProjectDirty(project: Project): boolean {
  return Boolean(project.git?.dirty || (project.git?.unpushedCommits ?? 0) > 0);
}

/** Descreve o que há de não enviado ao git num projeto, ou null se não houver nada. */
function projectRiskLabel(project: Project): string | null {
  const unpushedCommits = project.git?.unpushedCommits ?? 0;
  const parts = [
    project.git?.dirty ? "alterações não commitadas" : null,
    unpushedCommits > 0 ? `${unpushedCommits} ${unpushedCommits === 1 ? "commit não enviado" : "commits não enviados"}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const ARTIFACTS_LEAD = "Só os artefatos regeneráveis saem; o código-fonte não é tocado. Tudo vai para a Lixeira do macOS.";
const CACHE_RISK_TEXT = "Este cache contém algo que não volta sozinho. Os itens ficam na Lixeira até você esvaziá-la.";

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

  const risky = projects.filter((project) => projectRiskLabel(project) !== null);
  const riskText =
    risky.length === 0
      ? null
      : projects.length === 1
        ? `Este projeto tem ${projectRiskLabel(projects[0]!)}. Os artefatos não afetam o git, mas confira se ele não está em uso.`
        : `${risky.length === 1 ? `${risky[0]!.name} tem` : `${risky.length} deles têm`} trabalho não enviado ao git. Os artefatos não afetam o git, mas confira antes de seguir.`;

  return {
    title,
    lead: ARTIFACTS_LEAD,
    targets,
    preview,
    totalBytes,
    requiresNameConfirmation: false,
    projectName: null,
    riskText,
    onConfirmedTargetIds: { kind: "artifacts", projectIds: projects.map((project) => project.id) },
  };
}

/** Plano para mover um projeto inteiro para a Lixeira. Exige nome digitado se o git estiver sujo. */
export function planForProjectTrash(project: Project): CleanupPlan {
  const dirty = isProjectDirty(project);
  return {
    title: `Mover "${project.name}" para a Lixeira`,
    lead: "O projeto inteiro (código e artefatos) vai para a Lixeira do macOS.",
    targets: [{ type: "project", path: project.path }],
    preview: [{ path: project.path, bytes: project.totalBytes }],
    totalBytes: project.totalBytes,
    requiresNameConfirmation: dirty,
    projectName: dirty ? project.name : null,
    riskText: null,
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
    lead: cache.description,
    targets: [{ type: "cache", id: cache.id }],
    preview,
    totalBytes: cache.bytes,
    requiresNameConfirmation: false,
    projectName: null,
    riskText: cache.risk === "caution" ? CACHE_RISK_TEXT : null,
    onConfirmedTargetIds: { kind: "cache", cacheId: cache.id },
  };
}
