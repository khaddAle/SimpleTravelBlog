import { z } from 'zod';
import type { GroupMode } from './archive.js';

/**
 * Persisted archive UI state: which grouping mode is active and which groups are
 * open in each mode. The accordion is multi-open and closed by default; a reader
 * who opens a few groups, visits a post and comes back finds them as they left.
 *
 * Persistence is per-tab (sessionStorage) under a versioned key, zod-validated at
 * the parse boundary so a corrupt or stale snapshot degrades to the default
 * rather than throwing.
 */

export const ARCHIVE_STORAGE_KEY = 'fw-archive-v1';

const groupModeSchema = z.enum(['reise', 'land', 'jahr']);

const persistedSchema = z.object({
  mode: groupModeSchema,
  openByMode: z.object({
    reise: z.array(z.string()),
    land: z.array(z.string()),
    jahr: z.array(z.string()),
  }),
});

type Persisted = z.infer<typeof persistedSchema>;

function defaults(): Persisted {
  return { mode: 'reise', openByMode: { reise: [], land: [], jahr: [] } };
}

/** Read + validate the persisted snapshot; any failure → fresh defaults. */
function hydrate(): Persisted {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(ARCHIVE_STORAGE_KEY);
  } catch {
    return defaults();
  }
  if (!raw) return defaults();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults();
  }
  const result = persistedSchema.safeParse(parsed);
  return result.success ? result.data : defaults();
}

export class ArchiveState {
  mode = $state<GroupMode>('reise');
  openByMode = $state<Record<GroupMode, string[]>>({ reise: [], land: [], jahr: [] });

  constructor() {
    const initial = hydrate();
    this.mode = initial.mode;
    this.openByMode = initial.openByMode;

    // Persist on every change. The root is never disposed — the store lives for
    // the app's lifetime (and per-instance in tests).
    $effect.root(() => {
      $effect(() => {
        const snapshot: Persisted = { mode: this.mode, openByMode: this.openByMode };
        try {
          sessionStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(snapshot));
        } catch {
          // Storage unavailable/full — keep working in-memory.
        }
      });
    });
  }

  /** Open a closed group / close an open one within a mode. */
  toggle(mode: GroupMode, key: string): void {
    const cur = this.openByMode[mode];
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    this.openByMode = { ...this.openByMode, [mode]: next };
  }

  /** Open all of a mode's groups at once. */
  expandAll(mode: GroupMode, keys: string[]): void {
    this.openByMode = { ...this.openByMode, [mode]: [...keys] };
  }

  /** Close every group in a mode. */
  collapseAll(mode: GroupMode): void {
    this.openByMode = { ...this.openByMode, [mode]: [] };
  }

  setMode(mode: GroupMode): void {
    this.mode = mode;
  }

  /** Ensure a group is open (merge, idempotent) — used by the `?reise` deep-link. */
  openGroup(mode: GroupMode, key: string): void {
    if (this.openByMode[mode].includes(key)) return;
    this.openByMode = { ...this.openByMode, [mode]: [...this.openByMode[mode], key] };
  }
}

/** App-wide singleton; the Archive page binds to it. */
export const archiveState = new ArchiveState();
