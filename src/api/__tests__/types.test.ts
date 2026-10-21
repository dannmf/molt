import { describe, expect, it } from "vitest";

import type { CacheEntry, CleanupRequest, CleanupResult, Project, ScanProgress, ScanRequest } from "../../types";
import fixture from "../../../fixtures/model-snapshot.json";

/**
 * O fixture é gerado pelo Rust (`src-tauri/tests/model_snapshot.rs`) a partir de
 * `model.rs`. Este literal é tipado por `types.ts`. Se os dois baterem com o mesmo
 * fixture, `types.ts` está 1:1 com `model.rs`: um campo renomeado ou ausente em
 * qualquer um dos lados quebra o `toEqual` ou o `tsc --noEmit`.
 */
interface ModelSnapshot {
  project: Project;
  project_without_git: Project;
  cache_entries: CacheEntry[];
  scan_request: ScanRequest;
  scan_progress: ScanProgress;
  cleanup_request: CleanupRequest;
  cleanup_result: CleanupResult;
}

const snapshot: ModelSnapshot = {
  project: {
    id: "a1b2c3",
    name: "molt",
    path: "/Users/dev/molt",
    kinds: ["rust", "node"],
    totalBytes: 1_800_000_000,
    reclaimableBytes: 1_200_000_000,
    artifacts: [
      {
        path: "/Users/dev/molt/src-tauri/target",
        kind: "rustTarget",
        bytes: 900_000_000,
        regenerateHint: "cargo build",
      },
      {
        path: "/Users/dev/molt/.cache/custom",
        kind: { other: "CustomTool" },
        bytes: 1_000,
        regenerateHint: "custom-tool build",
      },
    ],
    lastModifiedAt: 1_732_000_000,
    git: {
      branch: "main",
      lastCommitAt: 1_732_000_000,
      dirty: true,
      unpushedCommits: 2,
      hasRemote: true,
    },
  },
  project_without_git: {
    id: "d4e5f6",
    name: "scratch",
    path: "/Users/dev/scratch",
    kinds: ["unknown"],
    totalBytes: 0,
    reclaimableBytes: 0,
    artifacts: [],
    lastModifiedAt: 1_700_000_000,
    git: null,
  },
  cache_entries: [
    {
      id: "npm-cache",
      label: "npm cache",
      tool: "npm",
      paths: ["/Users/dev/.npm/_cacache"],
      bytes: 1_400_000_000,
      risk: "safe",
      strategy: { type: "command", program: "npm", args: ["cache", "clean", "--force"] },
      description: "Cache de pacotes do npm.",
    },
    {
      id: "xcode-derived-data",
      label: "Xcode DerivedData",
      tool: "xcode",
      paths: ["/Users/dev/Library/Developer/Xcode/DerivedData"],
      bytes: 8_200_000_000,
      risk: "rebuildable",
      strategy: { type: "trash", paths: ["/Users/dev/Library/Developer/Xcode/DerivedData"] },
      description: "Build intermediário do Xcode.",
    },
  ],
  scan_request: {
    roots: ["/Users/dev"],
    maxDepth: 6,
    ignore: ["node_modules", ".git"],
    excludedPaths: ["/Users/dev/old-project"],
  },
  scan_progress: {
    scannedDirs: 4_200,
    projectsFound: 15,
    currentPath: "/Users/dev/molt",
  },
  cleanup_request: {
    targets: [
      { type: "artifact", path: "/Users/dev/molt/node_modules" },
      { type: "project", path: "/Users/dev/old-project" },
      { type: "cache", id: "npm-cache" },
    ],
    dryRun: false,
    allowDirtyGit: false,
  },
  cleanup_result: {
    freedBytes: 1_200_000_000,
    removed: ["/Users/dev/molt/node_modules"],
    failed: [["/Users/dev/old-project", "projeto com alterações não commitadas"]],
    dryRun: false,
  },
};

describe("types.ts matches model.rs", () => {
  it("serializa exatamente como o fixture gerado pelo Rust", () => {
    expect(snapshot).toEqual(fixture);
  });
});
