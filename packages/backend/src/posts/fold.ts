/**
 * Search-text folding plus a regex escaper, shared by the Post model (which
 * stores the folded `searchFold`) and the public search route (which folds the
 * incoming query the same way). Keeping both sides identical is exactly what
 * makes the substring search case- and accent-insensitive.
 */

// Unicode combining diacritical marks (U+0300–U+036F), peeled off after NFD.
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Normalize text for substring matching: lowercase, expand German umlauts to
 * their digraph form (ä→ae, ö→oe, ü→ue, ß→ss), then strip any remaining
 * combining diacritics (é→e). NOTE: umlauts fold to digraphs, so "Zürich"
 * matches a query of "Zürich" / "zuerich" but not bare "zurich" — the German
 * digraph is the canonical form for this blog.
 */
export function foldSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '');
}

/**
 * Escape every regex metacharacter so a user's query is matched as a LITERAL
 * substring. This is the security boundary: it removes any ability to inject a
 * pattern — a ReDoS payload or an unintended wildcard — through `$regex`.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
