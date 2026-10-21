import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { Project } from "../types";

export const PROJECTS_QUERY_KEY = ["projects"] as const;

/**
 * Lê os projetos carregados pelo scan. Nunca busca sozinho (`enabled: false`):
 * quem popula o cache é `useScan`, via `queryClient.setQueryData`.
 */
export function useProjectsQuery() {
  return useQuery<Project[]>({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => Promise.resolve([]),
    enabled: false,
    initialData: [],
  });
}

/** Atualizações locais otimistas após uma limpeza confirmada (o mock de `runCleanup` não reflete o resultado real). */
export function useProjectsCacheActions() {
  const queryClient = useQueryClient();

  return {
    clearArtifacts: (projectIds: string[]) =>
      queryClient.setQueryData<Project[]>(PROJECTS_QUERY_KEY, (prev) =>
        (prev ?? []).map((project) =>
          projectIds.includes(project.id) ? { ...project, artifacts: [], reclaimableBytes: 0 } : project,
        ),
      ),
    removeProjects: (projectIds: string[]) =>
      queryClient.setQueryData<Project[]>(PROJECTS_QUERY_KEY, (prev) =>
        (prev ?? []).filter((project) => !projectIds.includes(project.id)),
      ),
  };
}
