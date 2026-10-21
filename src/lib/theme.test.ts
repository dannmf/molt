import { describe, expect, it, vi } from "vitest";

import { applyThemeClass, resolveInitialTheme, toggleTheme } from "./theme";

describe("resolveInitialTheme", () => {
  it("usa o valor salvo quando é um tema válido", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
    expect(resolveInitialTheme("dark", false)).toBe("dark");
  });

  it("cai para a preferência do sistema quando não há valor salvo", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  it("ignora valor salvo inválido e usa a preferência do sistema", () => {
    expect(resolveInitialTheme("sepia", true)).toBe("dark");
  });
});

describe("toggleTheme", () => {
  it("alterna entre light e dark", () => {
    expect(toggleTheme("light")).toBe("dark");
    expect(toggleTheme("dark")).toBe("light");
  });
});

describe("applyThemeClass", () => {
  it("adiciona a classe dark quando o tema é dark", () => {
    const toggle = vi.fn();
    applyThemeClass("dark", { classList: { toggle } });
    expect(toggle).toHaveBeenCalledWith("dark", true);
  });

  it("remove a classe dark quando o tema é light", () => {
    const toggle = vi.fn();
    applyThemeClass("light", { classList: { toggle } });
    expect(toggle).toHaveBeenCalledWith("dark", false);
  });
});
