export const ZOOM_CONTROL_SPACE = 54;

export interface CardLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  leader: { x1: number; y1: number; x2: number; y2: number };
}

export function cardLayout(
  _pt: { x: number; y: number },
  _w: number,
  _h: number,
  _ratio: number,
): CardLayout {
  throw new Error('not implemented');
}
