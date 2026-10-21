import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listCaches } from "../api/client";
import type { CacheEntry } from "../types";

export const CACHES_QUERY_KEY = ["caches"] as const;

export function useCachesQuery() {
  return useQuery<CacheEntry[]>({ queryKey: CACHES_QUERY_KEY, queryFn: listCaches });
}

/** Remoção local otimista após limpar uma cache (o mock de `runCleanup` não reflete o resultado real). */
export function useRemoveCacheEntry() {
  const queryClient = useQueryClient();
  return (id: string) =>
    queryClient.setQueryData<CacheEntry[]>(CACHES_QUERY_KEY, (prev) => (prev ?? []).filter((entry) => entry.id !== id));
}
