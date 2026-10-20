/**
 * Wrappers do `invoke()` do Tauri para cada comando em `src-tauri/src/commands.rs`.
 *
 * Hoje devolvem dados de `mocks.ts` para que o frontend seja desenvolvido sem precisar
 * do backend rodando. Quando scanner/detectors/caches/cleanup forem implementados,
 * troque cada corpo por uma chamada real a `invoke("<comando>", req)`.
 */

import type { CacheEntry, CleanupRequest, CleanupResult, Project, ScanRequest } from "../types";
import { mockCaches, mockProjects } from "./mocks";

export async function scanProjects(_req: ScanRequest): Promise<Project[]> {
  return mockProjects;
}

export async function listCaches(): Promise<CacheEntry[]> {
  return mockCaches;
}

export async function runCleanup(req: CleanupRequest): Promise<CleanupResult> {
  return { freedBytes: 0, removed: [], failed: [], dryRun: req.dryRun };
}

export async function revealInFinder(_path: string): Promise<void> {
  return undefined;
}
