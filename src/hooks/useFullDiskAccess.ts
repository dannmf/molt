import { useQuery } from "@tanstack/react-query";

import { fullDiskAccessGranted } from "../api/client";

export const FULL_DISK_ACCESS_QUERY_KEY = ["full-disk-access"] as const;

export function useFullDiskAccess() {
  return useQuery<boolean>({ queryKey: FULL_DISK_ACCESS_QUERY_KEY, queryFn: fullDiskAccessGranted });
}
