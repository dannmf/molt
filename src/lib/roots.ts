export const SCAN_ROOTS_STORAGE_KEY = "molt:scan-roots";

/** `null` quando nada foi salvo ainda (primeira execução); o chamador decide o default. */
export function loadRoots(): string[] | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(SCAN_ROOTS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : null;
  } catch {
    return null;
  }
}

export function saveRoots(roots: string[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SCAN_ROOTS_STORAGE_KEY, JSON.stringify(roots));
}
