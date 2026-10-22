import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { onScanProgress, scanProjects } from "../api/client";
import {
  advanceScanRootTracker,
  createScanRootTracker,
  projectRootStates,
  type RootScanState,
  type ScanRootTracker,
} from "../lib/scanRootProgress";
import { useAppStore } from "../store/useAppStore";
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
  const excludedPaths = useAppStore((state) => state.excludedPaths);
  const [progressPct, setProgressPct] = useState(0);
  const [projectsFound, setProjectsFound] = useState(0);
  const [currentPath, setCurrentPath] = useState("");
  const [rootProgress, setRootProgress] = useState<RootScanState[]>([]);
  const unlistenRef = useRef<(() => void) | undefined>(undefined);
  const trackerRef = useRef<ScanRootTracker>(createScanRootTracker([]));

  const mutation = useMutation({
    mutationFn: (roots: string[]) =>
      scanProjects({ roots, maxDepth: 6, ignore: ["node_modules", ".git", "target"], excludedPaths }),
    onMutate: (roots) => {
      setProgressPct(0);
      setProjectsFound(0);
      setCurrentPath("");
      trackerRef.current = createScanRootTracker(roots);
      setRootProgress(projectRootStates(trackerRef.current, 0, true));

      unlistenRef.current = onScanProgress((progress) => {
        setProgressPct(approximateProgress(progress.scannedDirs));
        setProjectsFound(progress.projectsFound);
        setCurrentPath(progress.currentPath);
        trackerRef.current = advanceScanRootTracker(trackerRef.current, progress.currentPath, progress.projectsFound);
        setRootProgress(projectRootStates(trackerRef.current, progress.projectsFound, true));
      });
    },
    onSuccess: (projects: Project[]) => {
      queryClient.setQueryData(PROJECTS_QUERY_KEY, projects);
      setProgressPct(100);
      setProjectsFound(projects.length);
      setRootProgress(projectRootStates(trackerRef.current, projects.length, false));
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
    projectsFound,
    currentPath,
    rootProgress,
  };
}
