/**
 * In-app navigation guard for unsaved changes. svelte-spa-router has no
 * leave-guard, so a component (the post editor) registers a predicate that is
 * true while leaving should be confirmed; the admin shell consults it before
 * following a nav link or logging out. The confirm is synchronous
 * (window.confirm) because an anchor click must be vetoed in the same tick —
 * an async modal can't preventDefault in time.
 *
 * This covers in-app departures via the admin nav and logout. Tab close /
 * reload / external navigation are handled separately by a `beforeunload`
 * listener in the editor; the browser back button within the SPA is a known
 * gap (it neither fires beforeunload nor routes through here).
 */
let blocked: (() => boolean) | null = null;

export const navGuard = {
  /**
   * Register a predicate returning true while navigation away needs
   * confirmation. Returns an unregister function (call on component teardown).
   */
  register(predicate: () => boolean): () => void {
    blocked = predicate;
    return () => {
      if (blocked === predicate) blocked = null;
    };
  },

  /**
   * True if navigation may proceed. When a guard is active and reports blocked,
   * asks the user to confirm; a false return means stay put.
   */
  confirmLeave(
    message = 'Ungespeicherte Änderungen gehen verloren. Seite wirklich verlassen?',
  ): boolean {
    if (!blocked || !blocked()) return true;
    return window.confirm(message);
  },
};
