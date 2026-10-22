import { describe, expect, it } from "vitest";

import { advanceScanRootTracker, createScanRootTracker, projectRootStates } from "./scanRootProgress";

const ROOTS: [string, string, string] = ["/Users/dev/Developer", "/Users/dev/Projects", "/Users/dev/Documents"];

describe("scanRootProgress", () => {
  it("começa com todas as raízes aguardando", () => {
    const tracker = createScanRootTracker(ROOTS);
    const states = projectRootStates(tracker, 0, true);
    expect(states).toEqual([
      { root: ROOTS[0], status: "waiting", projects: 0 },
      { root: ROOTS[1], status: "waiting", projects: 0 },
      { root: ROOTS[2], status: "waiting", projects: 0 },
    ]);
  });

  it("marca a primeira raiz como varrendo quando currentPath bate com ela", () => {
    let tracker = createScanRootTracker(ROOTS);
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Developer/metrics-agent/bin", 7);
    const states = projectRootStates(tracker, 7, true);
    expect(states[0]).toEqual({ root: ROOTS[0], status: "scanning", projects: 7 });
    expect(states[1]!.status).toBe("waiting");
    expect(states[2]!.status).toBe("waiting");
  });

  it("congela a contagem da raiz anterior ao avançar para a próxima", () => {
    let tracker = createScanRootTracker(ROOTS);
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Developer/metrics-agent/bin", 7);
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Developer/zenith-app/src", 9);
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Projects/data-pipeline", 11);

    const states = projectRootStates(tracker, 11, true);
    expect(states[0]).toEqual({ root: ROOTS[0], status: "done", projects: 9 });
    expect(states[1]).toEqual({ root: ROOTS[1], status: "scanning", projects: 2 });
    expect(states[2]).toEqual({ root: ROOTS[2], status: "waiting", projects: 0 });
  });

  it("pula raízes sem nenhum evento próprio direto para concluído com 0 projetos", () => {
    let tracker = createScanRootTracker(ROOTS);
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Developer/metrics-agent", 5);
    // pastas/Projects nunca gera currentPath (ex.: vazia) — pula direto para Documents
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Documents/old-notes", 5);

    const states = projectRootStates(tracker, 5, true);
    expect(states[0]).toEqual({ root: ROOTS[0], status: "done", projects: 5 });
    expect(states[1]).toEqual({ root: ROOTS[1], status: "done", projects: 0 });
    expect(states[2]).toEqual({ root: ROOTS[2], status: "scanning", projects: 0 });
  });

  it("marca a última raiz ativa como concluída quando a varredura termina", () => {
    let tracker = createScanRootTracker(ROOTS);
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Developer/a", 3);
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Projects/b", 5);
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Documents/c", 8);

    const states = projectRootStates(tracker, 8, false);
    expect(states[2]).toEqual({ root: ROOTS[2], status: "done", projects: 3 });
  });

  it("ignora currentPath que não bate com nenhuma raiz conhecida", () => {
    let tracker = createScanRootTracker(ROOTS);
    tracker = advanceScanRootTracker(tracker, "/some/unrelated/path", 4);
    const states = projectRootStates(tracker, 4, true);
    expect(states.every((state) => state.status === "waiting")).toBe(true);
  });

  it("não volta a raiz anterior se currentPath oscilar por causa de paralelismo interno", () => {
    let tracker = createScanRootTracker(ROOTS);
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Projects/data-pipeline", 4);
    tracker = advanceScanRootTracker(tracker, "/Users/dev/Developer/old-path", 4);
    const states = projectRootStates(tracker, 4, true);
    expect(states[1]!.status).toBe("scanning");
  });
});
