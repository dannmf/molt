import { describe, expect, it } from "vitest";

import type { CacheEntry, Project } from "../types";
import { planForArtifacts, planForCache, planForProjectTrash } from "./cleanupPlan";

function project(overrides: Partial<Project>): Project {
  return {
    id: "p",
    name: "molt",
    path: "/Users/dev/molt",
    kinds: ["rust"],
    totalBytes: 1_000,
    reclaimableBytes: 500,
    artifacts: [],
    lastModifiedAt: 0,
    git: null,
    ...overrides,
  };
}

describe("planForArtifacts", () => {
  it("soma os artefatos de todos os projetos selecionados", () => {
    const plan = planForArtifacts([
      project({ artifacts: [{ path: "/a/node_modules", kind: "nodeModules", bytes: 100, regenerateHint: "" }] }),
      project({ id: "q", name: "other", artifacts: [{ path: "/b/target", kind: "rustTarget", bytes: 200, regenerateHint: "" }] }),
    ]);
    expect(plan.totalBytes).toBe(300);
    expect(plan.targets).toEqual([
      { type: "artifact", path: "/a/node_modules" },
      { type: "artifact", path: "/b/target" },
    ]);
    expect(plan.requiresNameConfirmation).toBe(false);
    expect(plan.onConfirmedTargetIds).toEqual({ kind: "artifacts", projectIds: ["p", "q"] });
  });

  it("usa singular/plural correto no título", () => {
    expect(planForArtifacts([project({})]).title).toContain('"molt"');
    expect(planForArtifacts([project({}), project({ id: "q" })]).title).toContain("2 projetos");
  });
});

describe("planForProjectTrash", () => {
  it("não exige nome para projeto limpo", () => {
    const plan = planForProjectTrash(project({ git: { branch: "main", lastCommitAt: 0, dirty: false, unpushedCommits: 0, hasRemote: true } }));
    expect(plan.requiresNameConfirmation).toBe(false);
    expect(plan.projectName).toBeNull();
    expect(plan.onConfirmedTargetIds).toEqual({ kind: "project", projectIds: ["p"] });
  });

  it("exige nome quando dirty", () => {
    const plan = planForProjectTrash(project({ git: { branch: "main", lastCommitAt: 0, dirty: true, unpushedCommits: 0, hasRemote: true } }));
    expect(plan.requiresNameConfirmation).toBe(true);
    expect(plan.projectName).toBe("molt");
  });

  it("exige nome quando há commits não enviados", () => {
    const plan = planForProjectTrash(project({ git: { branch: "main", lastCommitAt: 0, dirty: false, unpushedCommits: 3, hasRemote: true } }));
    expect(plan.requiresNameConfirmation).toBe(true);
  });
});

describe("planForCache", () => {
  const base: CacheEntry = {
    id: "npm-cache",
    label: "npm cache",
    tool: "npm",
    paths: ["/a", "/b"],
    bytes: 1_000,
    risk: "safe",
    strategy: { type: "command", program: "npm", args: [] },
    description: "",
  };

  it("divide os bytes entre os paths da entrada", () => {
    const plan = planForCache(base);
    expect(plan.preview).toEqual([
      { path: "/a", bytes: 500 },
      { path: "/b", bytes: 500 },
    ]);
    expect(plan.totalBytes).toBe(1_000);
    expect(plan.onConfirmedTargetIds).toEqual({ kind: "cache", cacheId: "npm-cache" });
  });

  it("usa o tool como preview quando não há paths (ex.: docker)", () => {
    const plan = planForCache({ ...base, paths: [] });
    expect(plan.preview).toEqual([{ path: "npm", bytes: 1_000 }]);
  });
});
