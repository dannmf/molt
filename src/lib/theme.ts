export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "molt:theme";

export function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveInitialTheme(storedValue: string | null, prefersDark: boolean): Theme {
  if (isTheme(storedValue)) {
    return storedValue;
  }
  return prefersDark ? "dark" : "light";
}

export function toggleTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function applyThemeClass(theme: Theme, root: { classList: { toggle(name: string, force: boolean): void } }) {
  root.classList.toggle("dark", theme === "dark");
}
