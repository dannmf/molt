import { useQuery } from "@tanstack/react-query";

import { getCleanupHistory } from "../api/client";
import type { CleanupHistoryEntry } from "../types";

export const CLEANUP_HISTORY_QUERY_KEY = ["cleanup-history"] as const;

export function useCleanupHistoryQuery() {
  return useQuery<CleanupHistoryEntry[]>({
    queryKey: CLEANUP_HISTORY_QUERY_KEY,
    queryFn: getCleanupHistory,
  });
}
