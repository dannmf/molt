import { useQuery, useQueryClient } from "@tanstack/react-query";

import { diskUsage } from "../api/client";
import type { DiskUsage } from "../types";

export const DISK_USAGE_QUERY_KEY = ["disk-usage"] as const;

export function useDiskUsage() {
  return useQuery<DiskUsage>({ queryKey: DISK_USAGE_QUERY_KEY, queryFn: diskUsage });
}

/** Força a releitura do `df`/`diskutil` real após uma limpeza (ver `ConfirmCleanupModal`). */
export function useRefreshDiskUsage() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: DISK_USAGE_QUERY_KEY });
}
