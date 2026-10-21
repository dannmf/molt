import { describe, expect, it } from "vitest";

import { canConfirmCleanup } from "./cleanupGate";

describe("canConfirmCleanup", () => {
  it("nunca confirma antes da pré-visualização (dry run) estar pronta", () => {
    expect(
      canConfirmCleanup({ previewReady: false, requiresNameConfirmation: false, typedName: "", projectName: "" }),
    ).toBe(false);
    expect(
      canConfirmCleanup({
        previewReady: false,
        requiresNameConfirmation: true,
        typedName: "molt",
        projectName: "molt",
      }),
    ).toBe(false);
  });

  it("confirma com preview pronto quando não exige nome", () => {
    expect(
      canConfirmCleanup({ previewReady: true, requiresNameConfirmation: false, typedName: "", projectName: "molt" }),
    ).toBe(true);
  });

  it("recusa quando exige nome e o texto digitado não bate", () => {
    expect(
      canConfirmCleanup({
        previewReady: true,
        requiresNameConfirmation: true,
        typedName: "mol",
        projectName: "molt",
      }),
    ).toBe(false);
  });

  it("ignora espaços nas bordas do nome digitado", () => {
    expect(
      canConfirmCleanup({
        previewReady: true,
        requiresNameConfirmation: true,
        typedName: "  molt  ",
        projectName: "molt",
      }),
    ).toBe(true);
  });

  it("confirma quando exige nome e o texto digitado bate exatamente", () => {
    expect(
      canConfirmCleanup({
        previewReady: true,
        requiresNameConfirmation: true,
        typedName: "molt",
        projectName: "molt",
      }),
    ).toBe(true);
  });
});
