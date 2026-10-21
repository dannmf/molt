import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listDockerResources } from "../api/client";
import type { DockerSummary } from "../types";

export const DOCKER_QUERY_KEY = ["docker"] as const;

/**
 * `staleTime: Infinity` pelo mesmo motivo de `useCachesQuery`: o catálogo Docker
 * só muda por ação local (ver `useRemoveDockerEntry`), e refazer a varredura é
 * lento (vários `docker ps`/`images`/`volume ls` por chamada).
 */
export function useDockerQuery() {
  return useQuery<DockerSummary>({ queryKey: DOCKER_QUERY_KEY, queryFn: listDockerResources, staleTime: Infinity });
}

/** Remoção local otimista após limpar um recurso Docker, em qualquer uma das categorias. */
export function useRemoveDockerEntry() {
  const queryClient = useQueryClient();
  return (id: string) =>
    queryClient.setQueryData<DockerSummary>(DOCKER_QUERY_KEY, (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        danglingImages: prev.danglingImages.filter((entry) => entry.id !== id),
        stoppedContainers: prev.stoppedContainers.filter((entry) => entry.id !== id),
        orphanVolumes: prev.orphanVolumes.filter((entry) => entry.id !== id),
        buildCache: prev.buildCache?.id === id ? null : prev.buildCache,
      };
    });
}
