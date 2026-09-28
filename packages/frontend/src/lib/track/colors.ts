/** Track colours by position: person 1 blue (the default accent), person 2 rust. */
export const TRACK_COLORS = ['#3f6699', '#c0612b'] as const;

export function trackColor(index: number): string {
  return TRACK_COLORS[index === 1 ? 1 : 0];
}
