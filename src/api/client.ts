/**
 * Wrappers do `invoke()` do Tauri para cada comando em `src-tauri/src/commands.rs`.
 *
 * Com `VITE_USE_MOCKS=1`, cada função devolve dados de `mocks.ts` (modo usado pelo
 * `pnpm dev` fora do shell do Tauri, onde não há `invoke()` real disponível).
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  CacheEntry,
  CleanupHistoryEntry,
  CleanupRequest,
  CleanupResult,
  DiskUsage,
  Project,
  ScanProgress,
  ScanRequest,
} from "../types";
import { mockCaches, mockCleanupHistory, mockDiskUsage, mockProjects } from "./mocks";

const useMocks = import.meta.env.VITE_USE_MOCKS === "1";

export async function scanProjects(req: ScanRequest): Promise<Project[]> {
  if (useMocks) return mockProjects;
  return invoke<Project[]>("scan_projects", { req });
}

export async function listCaches(): Promise<CacheEntry[]> {
  if (useMocks) return mockCaches;
  return invoke<CacheEntry[]>("list_caches");
}

export async function runCleanup(req: CleanupRequest): Promise<CleanupResult> {
  if (useMocks) return { freedBytes: 0, removed: [], failed: [], dryRun: req.dryRun };
  return invoke<CleanupResult>("run_cleanup", { req });
}

export async function getCleanupHistory(): Promise<CleanupHistoryEntry[]> {
  if (useMocks) return mockCleanupHistory;
  return invoke<CleanupHistoryEntry[]>("cleanup_history");
}

export async function revealInFinder(path: string): Promise<void> {
  if (useMocks) return undefined;
  await invoke("reveal_in_finder", { path });
}

export async function diskUsage(): Promise<DiskUsage> {
  if (useMocks) return mockDiskUsage;
  return invoke<DiskUsage>("disk_usage");
}

export async function fullDiskAccessGranted(): Promise<boolean> {
  if (useMocks) return true;
  return invoke<boolean>("full_disk_access_granted");
}

/** Abre Ajustes do Sistema -> Privacidade e Segurança -> Acesso Total ao Disco. */
export async function openFullDiskAccessSettings(): Promise<void> {
  if (useMocks) return undefined;
  await invoke("open_full_disk_access_settings");
}

/** Abre o explorador de arquivos nativo para escolher uma pasta raiz de varredura. */
export async function pickFolder(): Promise<string | null> {
  if (useMocks) return null;
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

/**
 * Assina o evento `scan://progress` emitido por `commands::scan_projects` durante
 * a varredura. Devolve uma função de cancelamento; chamadores devem chamá-la ao
 * desmontar (ex.: num `useEffect`/callback de limpeza do React Query).
 */
export function onScanProgress(callback: (progress: ScanProgress) => void): () => void {
  if (useMocks) return () => {};

  let unlisten: (() => void) | undefined;
  let cancelled = false;

  listen<ScanProgress>("scan://progress", (event) => callback(event.payload)).then((fn) => {
    if (cancelled) {
      fn();
    } else {
      unlisten = fn;
    }
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
}
