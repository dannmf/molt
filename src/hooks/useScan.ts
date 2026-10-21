import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { scanProjects } from "../api/client";
import type { Project } from "../types";
import { PROJECTS_QUERY_KEY } from "./useProjectsQuery";

/**
 * `scanProjects` (contra o mock) resolve de uma vez, sem emitir progresso real.
 * Simulamos uma barra de progresso local enquanto a varredura "roda", já que
 * `client.ts` não expõe (ainda) um jeito de assinar o evento `scan://progress`
 * do backend — ver nota em `docs/contract-requests.md`.
 */
const SIMULATED_SCAN_MS = 1_100;

export function useScan() {
  const queryClient = useQueryClient();
  const [progressPct, setProgressPct] = useState(0);
  const intervalRef = useRef<number | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (roots: string[]) =>
      scanProjects({ roots, maxDepth: 6, ignore: ["node_modules", ".git", "target"] }),
    onMutate: () => {
      setProgressPct(0);
      const start = Date.now();
      intervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - start;
        setProgressPct(Math.min(90, Math.round((elapsed / SIMULATED_SCAN_MS) * 90)));
      }, 60);
    },
    onSuccess: (projects: Project[]) => {
      queryClient.setQueryData(PROJECTS_QUERY_KEY, projects);
      setProgressPct(100);
    },
    onSettled: () => {
      window.clearInterval(intervalRef.current);
    },
  });

  return {
    scan: mutation.mutate,
    isScanning: mutation.isPending,
    isError: mutation.isError,
    progressPct,
  };
}
