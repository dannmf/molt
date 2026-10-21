import { useMutation } from "@tanstack/react-query";

import { runCleanup } from "../api/client";
import type { CleanupTarget } from "../types";

export function useCleanup() {
  return useMutation({
    mutationFn: ({ targets, allowDirtyGit }: { targets: CleanupTarget[]; allowDirtyGit: boolean }) =>
      runCleanup({ targets, dryRun: false, allowDirtyGit }),
  });
}
