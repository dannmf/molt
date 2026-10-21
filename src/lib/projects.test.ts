import { describe, expect, it } from "vitest";

import type { Project } from "../types";
import { computeTotals, distinctKinds, filterProjects, sortProjects } from "./projects";

const NOW = 1_732_000_000;
const DAY = 24 * 60 * 60;

function project(overrides: Partial<Project>): Project {
  return {
    id: overrides.id ?? "p",
    name: overrides.name ?? "project",
    path: overrides.path ?? "/Users/dev/project",
    kinds: overrides.kinds ?? ["node"],
    totalBytes: overrides.totalBytes ?? 0,
    reclaimableBytes: overrides.reclaimableBytes ?? 0,
    artifacts: overrides.artifacts ?? [],
    lastModifiedAt: overrides.lastModifiedAt ?? NOW,
    git: overrides.git ?? null,
  };
}

describe("sortProjects", () => {
  const projects = [
    project({ id: "a", name: "zebra", totalBytes: 100, reclaimableBytes: 10, lastModifiedAt: NOW - DAY }),
    project({ id: "b", name: "alpha", totalBytes: 300, reclaimableBytes: 50, lastModifiedAt: NOW - 3 * DAY }),
    project({ id: "c", name: "mid", totalBytes: 200, reclaimableBytes: 30, lastModifiedAt: NOW }),
  ];

  it("ordena por nome alfabeticamente", () => {
    expect(sortProjects(projects, "name", "asc").map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("ordena por espaço recuperável, decrescente", () => {
    expect(sortProjects(projects, "reclaimableBytes", "desc").map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("ordena por total, crescente", () => {
    expect(sortProjects(projects, "totalBytes", "asc").map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("ordena por última modificação, mais recente primeiro", () => {
    expect(sortProjects(projects, "lastModifiedAt", "desc").map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("não muta o array original", () => {
    const original = [...projects];
    sortProjects(projects, "name", "asc");
    expect(projects).toEqual(original);
  });
});

describe("filterProjects", () => {
  const projects = [
    project({ id: "rust-proj", kinds: ["rust"], lastModifiedAt: NOW - 40 * DAY, artifacts: [] }),
    project({
      id: "node-proj",
      kinds: ["node"],
      lastModifiedAt: NOW - 2 * DAY,
      artifacts: [{ path: "/x/node_modules", kind: "nodeModules", bytes: 10, regenerateHint: "pnpm install" }],
    }),
    project({ id: "mixed-proj", kinds: ["node", "rust"], lastModifiedAt: NOW, artifacts: [] }),
  ];

  it("sem filtros devolve tudo", () => {
    expect(filterProjects(projects, { kinds: [], minIdleDays: null, onlyWithArtifacts: false }, NOW)).toHaveLength(3);
  });

  it("filtra por stack (OR entre kinds selecionados)", () => {
    const result = filterProjects(projects, { kinds: ["rust"], minIdleDays: null, onlyWithArtifacts: false }, NOW);
    expect(result.map((p) => p.id).sort()).toEqual(["mixed-proj", "rust-proj"]);
  });

  it("filtra por dias parado", () => {
    const result = filterProjects(projects, { kinds: [], minIdleDays: 30, onlyWithArtifacts: false }, NOW);
    expect(result.map((p) => p.id)).toEqual(["rust-proj"]);
  });

  it("filtra só com artefatos", () => {
    const result = filterProjects(projects, { kinds: [], minIdleDays: null, onlyWithArtifacts: true }, NOW);
    expect(result.map((p) => p.id)).toEqual(["node-proj"]);
  });

  it("combina filtros", () => {
    const result = filterProjects(
      projects,
      { kinds: ["node"], minIdleDays: null, onlyWithArtifacts: true },
      NOW,
    );
    expect(result.map((p) => p.id)).toEqual(["node-proj"]);
  });
});

describe("computeTotals", () => {
  it("soma total e recuperável", () => {
    const projects = [
      project({ totalBytes: 100, reclaimableBytes: 10 }),
      project({ totalBytes: 200, reclaimableBytes: 30 }),
    ];
    expect(computeTotals(projects)).toEqual({ totalBytes: 300, reclaimableBytes: 40 });
  });

  it("devolve zero para lista vazia", () => {
    expect(computeTotals([])).toEqual({ totalBytes: 0, reclaimableBytes: 0 });
  });
});

describe("distinctKinds", () => {
  it("devolve kinds únicos na ordem de aparição", () => {
    const projects = [project({ kinds: ["node", "rust"] }), project({ kinds: ["rust", "go"] })];
    expect(distinctKinds(projects)).toEqual(["node", "rust", "go"]);
  });
});
