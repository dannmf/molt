import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { onScanProgress, scanProjects } from "../api/client";
import type { Project } from "../types";
import { PROJECTS_QUERY_KEY } from "./useProjectsQuery";

/**
 * `scan://progress` informa `scannedDirs` mas não um total esperado — não há
 * como calcular uma % exata. Aproxima com uma curva que sobe rápido e
 * desacelera conforme mais diretórios são varridos, sem nunca chegar a 100%
 * antes do scan terminar de fato (isso é setado em `onSuccess`).
 */
const APPROXIMATION_HALF_LIFE_DIRS = 400;

function approximateProgress(scannedDirs: number): number {
  return Math.min(95, Math.round((scannedDirs / (scannedDirs + APPROXIMATION_HALF_LIFE_DIRS)) * 100));
}

export function useScan() {
  const queryClient = useQueryClient();
  const [progressPct, setProgressPct] = useState(0);
  const unlistenRef = useRef<(() => void) | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (roots: string[]) =>
      scanProjects({ roots, maxDepth: 6, ignore: ["node_modules", ".git", "target"] }),
    onMutate: () => {
      setProgressPct(0);
      unlistenRef.current = onScanProgress((progress) => {
        setProgressPct(approximateProgress(progress.scannedDirs));
      });
    },
    onSuccess: (projects: Project[]) => {
      queryClient.setQueryData(PROJECTS_QUERY_KEY, projects);
      setProgressPct(100);
    },
    onSettled: () => {
      unlistenRef.current?.();
      unlistenRef.current = undefined;
    },
  });

  return {
    scan: mutation.mutate,
    isScanning: mutation.isPending,
    isError: mutation.isError,
    progressPct,
  };
}
