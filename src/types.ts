/**
 * Espelho exato de `src-tauri/src/model.rs`. Qualquer mudança aqui exige a mesma
 * mudança lá (veja o teste de snapshot em `src/api/__tests__/types.test.ts`).
 */

export type ProjectKind =
  | "node"
  | "rust"
  | "python"
  | "flutter"
  | "reactNative"
  | "expo"
  | "swift"
  | "android"
  | "go"
  | "java"
  | "unknown";

export type ArtifactKind =
  | "nodeModules"
  | "nextBuild"
  | "rustTarget"
  | "pythonVenv"
  | "pythonCache"
  | "flutterBuild"
  | "dartTool"
  | "pods"
  | "androidBuild"
  | "gradleProject"
  | "xcodeBuild"
  | "dist"
  | { other: string };

export interface Artifact {
  path: string;
  kind: ArtifactKind;
  bytes: number;
  regenerateHint: string;
}

export interface GitInfo {
  branch: string | null;
  lastCommitAt: number | null;
  dirty: boolean;
  unpushedCommits: number;
  hasRemote: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  kinds: ProjectKind[];
  totalBytes: number;
  reclaimableBytes: number;
  artifacts: Artifact[];
  lastModifiedAt: number;
  git: GitInfo | null;
}

export type CacheRisk = "safe" | "rebuildable" | "caution";

export type CleanStrategy =
  | { type: "trash"; paths: string[] }
  | { type: "command"; program: string; args: string[] };

export interface CacheEntry {
  id: string;
  label: string;
  tool: string;
  paths: string[];
  bytes: number;
  risk: CacheRisk;
  strategy: CleanStrategy;
  description: string;
}

export interface ScanRequest {
  roots: string[];
  maxDepth: number;
  ignore: string[];
  excludedPaths: string[];
}

export interface ScanProgress {
  scannedDirs: number;
  projectsFound: number;
  currentPath: string;
}

export type CleanupTarget =
  | { type: "artifact"; path: string }
  | { type: "project"; path: string }
  | { type: "cache"; id: string };

export interface CleanupRequest {
  targets: CleanupTarget[];
  dryRun: boolean;
  allowDirtyGit: boolean;
}

export interface CleanupResult {
  freedBytes: number;
  removed: string[];
  failed: Array<[string, string]>;
  dryRun: boolean;
}

export interface CleanupHistoryEntry {
  timestamp: number;
  message: string;
  success: boolean;
}

export interface DiskUsage {
  volumeName: string;
  totalBytes: number;
  freeBytes: number;
}
