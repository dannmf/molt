import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listCaches } from "../api/client";
import type { CacheEntry } from "../types";

export const CACHES_QUERY_KEY = ["caches"] as const;

/**
 * `staleTime: Infinity` porque o catálogo de caches só muda por ação local
 * (ver `useRemoveCacheEntry`): sem isso, o react-query refaz a varredura
 * (lenta, por rodar binários como `du`/`docker`) toda vez que a tela de
 * Caches remonta, mesmo sem nada ter mudado no disco.
 */
export function useCachesQuery() {
  return useQuery<CacheEntry[]>({ queryKey: CACHES_QUERY_KEY, queryFn: listCaches, staleTime: Infinity });
}

/** Remoção local otimista após limpar uma cache (o mock de `runCleanup` não reflete o resultado real). */
export function useRemoveCacheEntry() {
  const queryClient = useQueryClient();
  return (id: string) =>
    queryClient.setQueryData<CacheEntry[]>(CACHES_QUERY_KEY, (prev) => (prev ?? []).filter((entry) => entry.id !== id));
}
