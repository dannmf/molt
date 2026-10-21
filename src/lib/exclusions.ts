export const EXCLUDED_PATHS_STORAGE_KEY = "molt:excluded-paths";

export function loadExcludedPaths(): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(EXCLUDED_PATHS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function saveExcludedPaths(paths: string[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(EXCLUDED_PATHS_STORAGE_KEY, JSON.stringify(paths));
}
