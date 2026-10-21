export const LAST_SCAN_STORAGE_KEY = "molt:last-scan-at";

export function loadLastScanAt(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(LAST_SCAN_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function saveLastScanAt(unixSeconds: number): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LAST_SCAN_STORAGE_KEY, String(unixSeconds));
}
