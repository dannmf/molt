import { describe, expect, it } from "vitest";

import { computeSettleFrame } from "./scanSettleAnimation";

const ROOTS: [string, string, string] = ["/Users/dev/Developer", "/Users/dev/Projects", "/Users/dev/Documents"];

describe("computeSettleFrame", () => {
  it("em t=0 só a primeira raiz está ativa (varrendo), com contagem zero, e as demais aguardando", () => {
    const frame = computeSettleFrame(ROOTS, [0, 0, 0], [7, 6, 0], 0);
    expect(frame.states).toEqual([
      { root: ROOTS[0], status: "scanning", projects: 0 },
      { root: ROOTS[1], status: "waiting", projects: 0 },
      { root: ROOTS[2], status: "waiting", projects: 0 },
    ]);
    expect(frame.progressPct).toBe(0);
    expect(frame.done).toBe(false);
  });

  it("termina com todas as raízes concluídas e as contagens finais em t=1", () => {
    const frame = computeSettleFrame(ROOTS, [0, 0, 0], [7, 6, 0], 1);
    expect(frame.states).toEqual([
      { root: ROOTS[0], status: "done", projects: 7 },
      { root: ROOTS[1], status: "done", projects: 6 },
      { root: ROOTS[2], status: "done", projects: 0 },
    ]);
    expect(frame.progressPct).toBe(100);
    expect(frame.projectsFound).toBe(13);
    expect(frame.done).toBe(true);
  });

  it("anima uma raiz de cada vez, na ordem, sem pular para a próxima antes da hora", () => {
    const frame = computeSettleFrame(ROOTS, [0, 0, 0], [9, 3, 0], 0.2);
    expect(frame.states[0]!.status).toBe("scanning");
    expect(frame.states[0]!.projects).toBeGreaterThan(0);
    expect(frame.states[0]!.projects).toBeLessThan(9);
    expect(frame.states[1]!.status).toBe("waiting");
    expect(frame.states[2]!.status).toBe("waiting");
  });

  it("parte da contagem já exibida ao vivo (startCounts), não de zero", () => {
    const frame = computeSettleFrame(ROOTS, [5, 0, 0], [9, 3, 0], 0.01);
    expect(frame.states[0]!.projects).toBeGreaterThanOrEqual(5);
  });

  it("a porcentagem cresce de forma monotônica com t", () => {
    const frameEarly = computeSettleFrame(ROOTS, [0, 0, 0], [9, 3, 2], 0.2);
    const frameLate = computeSettleFrame(ROOTS, [0, 0, 0], [9, 3, 2], 0.8);
    expect(frameLate.progressPct).toBeGreaterThan(frameEarly.progressPct);
  });

  it("não quebra quando não há raízes", () => {
    const frame = computeSettleFrame([], [], [], 0.5);
    expect(frame.states).toEqual([]);
    expect(frame.projectsFound).toBe(0);
  });

  it("satura em 100% e done=true para t acima de 1", () => {
    const frame = computeSettleFrame(ROOTS, [0, 0, 0], [7, 6, 0], 1.5);
    expect(frame.progressPct).toBe(100);
    expect(frame.done).toBe(true);
  });
});
