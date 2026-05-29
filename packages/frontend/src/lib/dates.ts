/** Date helpers shared by the editor (date input) and reader (display). */

/** ISO datetime → `YYYY-MM-DD` for an `<input type="date">`. Empty if invalid. */
export function toDateInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` from a date input → ISO datetime at midnight UTC. */
export function fromDateInputValue(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

/** ISO datetime → long German date, e.g. "5. März 2026". Empty if invalid. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
