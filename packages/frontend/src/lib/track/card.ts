/** Left edge for a card on the left side: clear of Leaflet's zoom control. */
export const ZOOM_CONTROL_SPACE = 54;
const MARGIN = 12;
/** Maps narrower than this (phones) get the compact card. */
const COMPACT_BELOW = 600;
/** Largest card width; the photo's display variant is 1600 px. */
const MAX_WIDTH = 640;

export interface CardLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Phone-sized map: thin padding, one-line caption. */
  compact: boolean;
  /** From the nearest card edge to the photo spot. */
  leader: { x1: number; y1: number; x2: number; y2: number };
}

/**
 * Where the photo card sits on a `w`×`h` map: on the side away from its spot
 * `pt`. It scales with the map: 30 % of its width (at least 180 px, at most
 * 640 px), and at most half its height unless that would undercut the minimum
 * width. On phone-sized maps 45 % (at least 130 px) with thinner padding. It
 * never grows taller than the map. `ratio` is the photo's height / width.
 */
export function cardLayout(pt: { x: number; y: number }, w: number, h: number, ratio: number): CardLayout {
  const compact = w < COMPACT_BELOW;
  // Padding around the image (both sides) and the caption + hold bar below it.
  const pad = compact ? 8 : 16;
  const caption = compact ? 28 : 40;
  const minW = compact ? 130 : 180;
  const widthFor = (cardH: number) => (cardH - pad - caption) / ratio + pad;
  const wanted = Math.max(minW, w * (compact ? 0.45 : 0.3));
  const width = Math.min(MAX_WIDTH, wanted, Math.max(minW, widthFor(h / 2)), widthFor(h - 2 * MARGIN));
  const height = (width - pad) * ratio + pad + caption;
  const left = pt.x < w / 2 ? w - width - MARGIN : ZOOM_CONTROL_SPACE;
  const top = pt.y > h / 2 ? MARGIN : Math.max(MARGIN, h - height - MARGIN);
  const x1 = Math.min(left + width, Math.max(left, pt.x));
  const y1 = Math.min(top + height, Math.max(top, pt.y));
  return { left, top, width, height, compact, leader: { x1, y1, x2: pt.x, y2: pt.y } };
}
