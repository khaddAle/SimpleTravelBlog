/**
 * ISO 3166-1 alpha-2 country code → German country name (e.g. `IT` → `Italien`),
 * used wherever the reader UI shows a country alongside a place. Posts store the
 * code; the design displays the long German name. Uses the platform's
 * `Intl.DisplayNames`; unknown or malformed input is returned unchanged.
 */
const display = new Intl.DisplayNames(['de'], { type: 'region', fallback: 'code' });

export function countryName(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return code;
  const name = display.of(code.toUpperCase());
  return name ?? code;
}
