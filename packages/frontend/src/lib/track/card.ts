/** Left edge for a card on the left side: clear of Leaflet's zoom control. */
export const ZOOM_CONTROL_SPACE = 54;
const MARGIN = 12;
/** Card padding around the image (8 px each side). */
const PAD = 16;
/** Caption line and hold bar below the image. */
const CAPTION = 40;

export interface CardLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  /** From the nearest card edge to the photo spot. */
  leader: { x1: number; y1: number; x2: number; y2: number };
}

/**
 * Where the photo card sits on a `w`×`h` map: on the side away from its spot
 * `pt`, about a third of the map wide, never taller than the map. `ratio` is
 * the photo's height / width.
 */
export function cardLayout(pt: { x: number; y: number }, w: number, h: number, ratio: number): CardLayout {
  const maxW = (h - 2 * MARGIN - PAD - CAPTION) / ratio + PAD;
  const width = Math.min(300, Math.max(180, w * 0.36), maxW);
  const height = (width - PAD) * ratio + PAD + CAPTION;
  const left = pt.x < w / 2 ? w - width - MARGIN : ZOOM_CONTROL_SPACE;
  const top = pt.y > h / 2 ? MARGIN : Math.max(MARGIN, h - height - MARGIN);
  const x1 = Math.min(left + width, Math.max(left, pt.x));
  const y1 = Math.min(top + height, Math.max(top, pt.y));
  return { left, top, width, height, leader: { x1, y1, x2: pt.x, y2: pt.y } };
}
