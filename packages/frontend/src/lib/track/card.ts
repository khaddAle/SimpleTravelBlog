/** Left edge for a card on the left side: clear of Leaflet's zoom control. */
export const ZOOM_CONTROL_SPACE = 54;
const MARGIN = 12;
/** Maps narrower than this (phones) get the compact card. */
const COMPACT_BELOW = 600;

export interface CardLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Phone-sized map: smaller card, thin padding, one-line caption. */
  compact: boolean;
  /** From the nearest card edge to the photo spot. */
  leader: { x1: number; y1: number; x2: number; y2: number };
}

/**
 * Where the photo card sits on a `w`×`h` map: on the side away from its spot
 * `pt`, never taller than the map. About a third of the map wide (180–300 px);
 * on phone-sized maps 40 % (at least 130 px) with thinner padding. `ratio` is
 * the photo's height / width.
 */
export function cardLayout(pt: { x: number; y: number }, w: number, h: number, ratio: number): CardLayout {
  const compact = w < COMPACT_BELOW;
  // Padding around the image (both sides) and the caption + hold bar below it.
  const pad = compact ? 8 : 16;
  const caption = compact ? 28 : 40;
  const maxW = (h - 2 * MARGIN - pad - caption) / ratio + pad;
  const wanted = compact ? Math.max(130, w * 0.4) : Math.max(180, w * 0.36);
  const width = Math.min(300, wanted, maxW);
  const height = (width - pad) * ratio + pad + caption;
  const left = pt.x < w / 2 ? w - width - MARGIN : ZOOM_CONTROL_SPACE;
  const top = pt.y > h / 2 ? MARGIN : Math.max(MARGIN, h - height - MARGIN);
  const x1 = Math.min(left + width, Math.max(left, pt.x));
  const y1 = Math.min(top + height, Math.max(top, pt.y));
  return { left, top, width, height, compact, leader: { x1, y1, x2: pt.x, y2: pt.y } };
}
