/**
 * Interpreta a mensagem em texto livre de CleanupHistoryEntry.message.
 * O backend não garante um formato estável (ver docs/contract-requests.md),
 * então todo padrão não reconhecido cai no fallback com a mensagem crua.
 */

export interface ParsedHistoryEntry {
  target: string;
  reason: string | null;
  freedBytes: number | null;
}

const REMOVED_CACHE = /^removido cache '(.+)' \(\d+ caminho\(s\), ~(\d+) bytes\)$/;
const REMOVED = /^removido (.+) \(~(\d+) bytes\)$/;
const FAILED = /^falha (.+?): (.+)$/;

export function parseHistoryEntry(message: string): ParsedHistoryEntry {
  const removedCache = REMOVED_CACHE.exec(message);
  if (removedCache) {
    const [, target, bytes] = removedCache as unknown as [string, string, string];
    return { target, reason: null, freedBytes: Number(bytes) };
  }

  const removed = REMOVED.exec(message);
  if (removed) {
    const [, target, bytes] = removed as unknown as [string, string, string];
    return { target, reason: null, freedBytes: Number(bytes) };
  }

  const failed = FAILED.exec(message);
  if (failed) {
    const [, target, reason] = failed as unknown as [string, string, string];
    return { target, reason, freedBytes: null };
  }

  return { target: message, reason: null, freedBytes: null };
}
