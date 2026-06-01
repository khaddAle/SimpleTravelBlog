import { describe, it, expect } from 'vitest';
import { foldSearch, escapeRegex } from './fold.js';

describe('foldSearch', () => {
  it('lowercases so matching is case-insensitive', () => {
    expect(foldSearch('Zugspitze')).toBe('zugspitze');
  });

  it('expands german umlauts to their digraph form', () => {
    expect(foldSearch('München')).toBe('muenchen');
    expect(foldSearch('Öland')).toBe('oeland');
    expect(foldSearch('Ärmel')).toBe('aermel');
    expect(foldSearch('Straße')).toBe('strasse');
  });

  it('strips other combining diacritics down to the base letter', () => {
    expect(foldSearch('Málaga')).toBe('malaga');
    expect(foldSearch('Café')).toBe('cafe');
  });

  it('folds a query the same way it folds stored text (round-trip)', () => {
    // The query "zürich" and the stored "Zürich" must produce the same key.
    expect(foldSearch('zürich')).toBe(foldSearch('Zürich'));
  });

  it('leaves plain ascii and spacing untouched', () => {
    expect(foldSearch('berge am meer')).toBe('berge am meer');
  });
});

describe('escapeRegex', () => {
  it('escapes every regex metacharacter so the query matches literally', () => {
    expect(escapeRegex('a.b*c+d?')).toBe('a\\.b\\*c\\+d\\?');
    expect(escapeRegex('(a|b)[c]{2}^$')).toBe('\\(a\\|b\\)\\[c\\]\\{2\\}\\^\\$');
    expect(escapeRegex('back\\slash')).toBe('back\\\\slash');
  });

  it('leaves ordinary text unchanged', () => {
    expect(escapeRegex('zugspitze')).toBe('zugspitze');
  });

  it('neutralises a catastrophic-backtracking pattern into a literal', () => {
    // A classic ReDoS payload must survive only as inert literal text — no
    // grouping/quantifier metacharacters remain active.
    const escaped = escapeRegex('(a+)+$');
    expect(escaped).toBe('\\(a\\+\\)\\+\\$');
    expect(new RegExp(escaped).test('(a+)+$')).toBe(true);
  });
});
