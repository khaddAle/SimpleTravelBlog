import { describe, it, expect, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import { ArchiveState, ARCHIVE_STORAGE_KEY } from './archiveState.svelte.js';

beforeEach(() => sessionStorage.clear());

function persisted(): { mode: string; openByMode: Record<string, string[]> } {
  return JSON.parse(sessionStorage.getItem(ARCHIVE_STORAGE_KEY) ?? '{}');
}

describe('ArchiveState', () => {
  it('defaults to reise mode with everything closed', () => {
    const s = new ArchiveState();
    expect(s.mode).toBe('reise');
    expect(s.openByMode).toEqual({ reise: [], land: [], jahr: [] });
  });

  it('hydrates a valid persisted snapshot', () => {
    sessionStorage.setItem(
      ARCHIVE_STORAGE_KEY,
      JSON.stringify({ mode: 'land', openByMode: { reise: ['t1'], land: ['DE'], jahr: [] } }),
    );
    const s = new ArchiveState();
    expect(s.mode).toBe('land');
    expect(s.openByMode.reise).toEqual(['t1']);
    expect(s.openByMode.land).toEqual(['DE']);
  });

  it('falls back to defaults on invalid JSON', () => {
    sessionStorage.setItem(ARCHIVE_STORAGE_KEY, '{ not json');
    const s = new ArchiveState();
    expect(s.mode).toBe('reise');
    expect(s.openByMode).toEqual({ reise: [], land: [], jahr: [] });
  });

  it('falls back to defaults on a schema-invalid snapshot', () => {
    sessionStorage.setItem(
      ARCHIVE_STORAGE_KEY,
      JSON.stringify({ mode: 'nope', openByMode: { reise: 'x' } }),
    );
    const s = new ArchiveState();
    expect(s.mode).toBe('reise');
    expect(s.openByMode).toEqual({ reise: [], land: [], jahr: [] });
  });

  it('toggle adds then removes a key, persisting each change', () => {
    const s = new ArchiveState();
    s.toggle('reise', 't1');
    flushSync();
    expect(s.openByMode.reise).toEqual(['t1']);
    expect(persisted().openByMode.reise).toEqual(['t1']);

    s.toggle('reise', 't1');
    flushSync();
    expect(s.openByMode.reise).toEqual([]);
    expect(persisted().openByMode.reise).toEqual([]);
  });

  it('expandAll opens every key for a mode; collapseAll clears it', () => {
    const s = new ArchiveState();
    s.expandAll('land', ['DE', 'IT']);
    flushSync();
    expect(s.openByMode.land).toEqual(['DE', 'IT']);

    s.collapseAll('land');
    flushSync();
    expect(s.openByMode.land).toEqual([]);
  });

  it('setMode persists the active mode', () => {
    const s = new ArchiveState();
    s.setMode('jahr');
    flushSync();
    expect(s.mode).toBe('jahr');
    expect(persisted().mode).toBe('jahr');
  });

  it('openGroup merges a key without duplicating it', () => {
    const s = new ArchiveState();
    s.openGroup('reise', 't1');
    s.openGroup('reise', 't1');
    s.openGroup('reise', 't2');
    flushSync();
    expect(s.openByMode.reise).toEqual(['t1', 't2']);
    expect(persisted().openByMode.reise).toEqual(['t1', 't2']);
  });

  it('toggling one mode leaves the other modes untouched', () => {
    const s = new ArchiveState();
    s.toggle('reise', 't1');
    s.toggle('land', 'DE');
    flushSync();
    expect(s.openByMode.reise).toEqual(['t1']);
    expect(s.openByMode.land).toEqual(['DE']);
    expect(s.openByMode.jahr).toEqual([]);
  });
});
