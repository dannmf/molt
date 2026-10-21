/**
 * Formatação de bytes e datas relativas, em pt-BR, no estilo do Finder.
 */

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/** Extrai o último segmento de um caminho (nome do arquivo ou pasta). */
export function pathBasename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
}

/** Formata bytes em base 1000 (KB/MB/GB...), como o Finder. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < UNITS.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  const decimals = unitIndex === 0 ? 0 : value < 10 ? 1 : 0;
  const formatted = value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${formatted} ${UNITS[unitIndex]}`;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Formata um timestamp unix (segundos) como "há N dias", relativo a `now`. */
export function formatRelativeDate(unixSeconds: number, now: number = Date.now() / 1000): string {
  const diff = Math.max(0, Math.round(now - unixSeconds));

  if (diff < MINUTE) {
    return "agora";
  }
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return minutes === 1 ? "há 1 minuto" : `há ${minutes} minutos`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return hours === 1 ? "há 1 hora" : `há ${hours} horas`;
  }
  if (diff < MONTH) {
    const days = Math.floor(diff / DAY);
    return days === 1 ? "ontem" : `há ${days} dias`;
  }
  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH);
    return months === 1 ? "há 1 mês" : `há ${months} meses`;
  }
  const years = Math.floor(diff / YEAR);
  return years === 1 ? "há 1 ano" : `há ${years} anos`;
}

/** Quantos dias inteiros se passaram desde `unixSeconds`, relativo a `now`. */
export function daysSince(unixSeconds: number, now: number = Date.now() / 1000): number {
  return Math.floor(Math.max(0, now - unixSeconds) / DAY);
}
