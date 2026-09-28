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
  // `|| 0` turns -0 into 0.
  return `${(Math.round(m) || 0).toLocaleString('de-DE')} m`;
}

/** 120 → "UTC+2", −570 → "UTC−9:30", 0 → "UTC±0". */
export function fmtOffset(min: number): string {
  if (min === 0) return 'UTC±0';
  const sign = min > 0 ? '+' : '−';
  const a = Math.abs(min);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${pad(a % 60)}` : ''}`;
}

/** Axis step from 1/2/2.5/5 × 10ⁿ giving about `target` ticks over `range`. */
export function niceStep(range: number, target: number): number {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
}

/** 9 648 000 ms → "2:41 h". */
export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  return `${Math.floor(min / 60)}:${pad(min % 60)} h`;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** UTC ms → local "HH:MM[:SS]" at the post's offset. */
export function fmtLocal(utc: number, offsetMin: number, withSec = false): string {
  const d = new Date(utc + offsetMin * 60_000);
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return withSec ? `${hm}:${pad(d.getUTCSeconds())}` : hm;
}

/** UTC ms → local "Sa, 12.09." at the post's offset. */
export function fmtLocalDay(utc: number, offsetMin: number): string {
  const d = new Date(utc + offsetMin * 60_000);
  return `${WEEKDAYS[d.getUTCDay()]!}, ${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.`;
}
