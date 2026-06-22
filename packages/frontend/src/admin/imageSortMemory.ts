/** Image list sort keys, shared by the library and the editor's image picker. */
export type ImageSortKey = 'newest' | 'oldest' | 'filename' | 'taken-newest' | 'taken-oldest';

/**
 * In-memory, module-lifetime memory of the last-chosen sort per view. Lets a
 * view restore the user's choice when it is reopened within the same page load
 * (e.g. closing and reopening the picker dialog). Intentionally NOT persisted:
 * a full reload or a new tab resets it to the view's own default. Each view
 * passes its own key, so the library and the picker remember independently.
 */
const lastChosen = new Map<string, ImageSortKey>();

/** The remembered sort for `view`, or `fallback` if the view hasn't been used yet. */
export function rememberedSort(view: string, fallback: ImageSortKey): ImageSortKey {
  return lastChosen.get(view) ?? fallback;
}

/** Record the sort the user picked in `view` for the rest of this session. */
export function rememberSort(view: string, sort: ImageSortKey): void {
  lastChosen.set(view, sort);
}

/** Test-only: clear all remembered sorts so cases start from each view's default. */
export function clearRememberedSorts(): void {
  lastChosen.clear();
}
