// German formatters for GPS-track stats and the replay clock.

const pad = (n: number): string => String(n).padStart(2, '0');

/** Selectable UTC offsets in minutes: −12 h … +14 h in 30 min steps. */
export const OFFSET_CHOICES: number[] = Array.from({ length: 53 }, (_, i) => -720 + i * 30);

/** 19520 → "19,5 km". */
export function fmtKm(m: number): string {
  const km = (m / 1000).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${km} km`;
}

/** 1025.4 → "1.025 m". */
export function fmtM(m: number): string {
  return `${Math.round(m).toLocaleString('de-DE')} m`;
}

/** 120 → "UTC+2", −570 → "UTC−9:30", 0 → "UTC±0". */
export function fmtOffset(min: number): string {
  if (min === 0) return 'UTC±0';
  const sign = min > 0 ? '+' : '−';
  const a = Math.abs(min);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${pad(a % 60)}` : ''}`;
}

export function niceStep(_range: number, _target: number): number {
  throw new Error('not implemented');
}

/** 9 648 000 ms → "2:41 h". */
export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  return `${Math.floor(min / 60)}:${pad(min % 60)} h`;
}
