import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { onScanProgress, scanProjects } from "../api/client";
import {
  advanceScanRootTracker,
  createScanRootTracker,
  finalRootCounts,
  projectRootStates,
  type RootScanState,
  type ScanRootTracker,
} from "../lib/scanRootProgress";
import { computeSettleFrame } from "../lib/scanSettleAnimation";
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

/**
 * O backend só emite `scan://progress` a cada 100ms de varredura real
 * (ver scanner/mod.rs). Para raízes pequenas, o scan inteiro termina antes
 * do primeiro evento — sem essa fase de "settle", a tela pularia de 0% para
 * o resultado final quase instantaneamente. Ela sempre roda após o scan
 * terminar, animando do que já estava na tela até o resultado real.
 */
const SETTLE_DURATION_MS = 1600;

export function useScan(options?: { onComplete?: () => void }) {
  const queryClient = useQueryClient();
  const excludedPaths = useAppStore((state) => state.excludedPaths);
  const [progressPct, setProgressPct] = useState(0);
  const [projectsFound, setProjectsFound] = useState(0);
  const [currentPath, setCurrentPath] = useState("");
  const [rootProgress, setRootProgress] = useState<RootScanState[]>([]);
  const [isSettling, setIsSettling] = useState(false);
  const unlistenRef = useRef<(() => void) | undefined>(undefined);
  const trackerRef = useRef<ScanRootTracker>(createScanRootTracker([]));
  const rootProgressRef = useRef<RootScanState[]>([]);
  const settleFrameRef = useRef<number | undefined>(undefined);
  const onCompleteRef = useRef(options?.onComplete);

  useEffect(() => {
    onCompleteRef.current = options?.onComplete;
  }, [options?.onComplete]);

  useEffect(
    () => () => {
      if (settleFrameRef.current !== undefined) cancelAnimationFrame(settleFrameRef.current);
    },
    [],
  );

  function updateRootProgress(states: RootScanState[]) {
    rootProgressRef.current = states;
    setRootProgress(states);
  }

  const mutation = useMutation({
    mutationFn: (roots: string[]) =>
      scanProjects({ roots, maxDepth: 6, ignore: ["node_modules", ".git", "target"], excludedPaths }),
    onMutate: (roots) => {
      if (settleFrameRef.current !== undefined) {
        cancelAnimationFrame(settleFrameRef.current);
        settleFrameRef.current = undefined;
      }
      setProgressPct(0);
      setProjectsFound(0);
      setCurrentPath("");
      setIsSettling(false);
      trackerRef.current = createScanRootTracker(roots);
      updateRootProgress(projectRootStates(trackerRef.current, 0, true));

      unlistenRef.current = onScanProgress((progress) => {
        setProgressPct(approximateProgress(progress.scannedDirs));
        setProjectsFound(progress.projectsFound);
        setCurrentPath(progress.currentPath);
        trackerRef.current = advanceScanRootTracker(trackerRef.current, progress.currentPath, progress.projectsFound);
        updateRootProgress(projectRootStates(trackerRef.current, progress.projectsFound, true));
      });
    },
    onSuccess: (projects: Project[]) => {
      queryClient.setQueryData(PROJECTS_QUERY_KEY, projects);

      const roots = trackerRef.current.roots;
      const startCounts = rootProgressRef.current.map((state) => state.projects);
      const finalCounts = finalRootCounts(
        roots,
        projects.map((project) => project.path),
      );

      setIsSettling(true);
      const start = performance.now();

      const tick = (now: number) => {
        const frame = computeSettleFrame(roots, startCounts, finalCounts, (now - start) / SETTLE_DURATION_MS);
        setProgressPct(frame.progressPct);
        setProjectsFound(frame.projectsFound);
        updateRootProgress(frame.states);

        if (frame.done) {
          settleFrameRef.current = undefined;
          setIsSettling(false);
          onCompleteRef.current?.();
          return;
        }
        settleFrameRef.current = requestAnimationFrame(tick);
      };
      settleFrameRef.current = requestAnimationFrame(tick);
    },
    onSettled: () => {
      unlistenRef.current?.();
      unlistenRef.current = undefined;
    },
  });

  return {
    scan: mutation.mutate,
    isScanning: mutation.isPending || isSettling,
    isError: mutation.isError,
    progressPct,
    projectsFound,
    currentPath,
    rootProgress,
  };
}
