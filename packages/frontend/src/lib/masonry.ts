/**
 * Order-preserving shortest-column masonry. Given each image's natural
 * dimensions and a column count, place images in source order into whichever
 * column is currently shortest (measured by accumulated unit-width height
 * `height/width`). Returns, per column, the original indices it received — so
 * the caller renders columns while the Lightbox still keys off the original
 * gallery order. Heights stay balanced; reading order is preserved down each
 * column. Pure (CSS multicol would reorder column-major; this does not).
 */

export interface Dim {
  width: number;
  height: number;
}

/**
 * Orientation from natural dimensions: portrait when the aspect ratio
 * (width/height) is below 0.95. Missing/invalid dims default to landscape, so a
 * post without the §0 sidecar keeps the original (un-cropped-for-landscape)
 * rendering.
 */
export function isPortrait(dim?: Dim): boolean {
  if (!dim || dim.width <= 0 || dim.height <= 0) return false;
  return dim.width / dim.height < 0.95;
}

export function packMasonry(dims: Dim[], columns: number): number[][] {
  const cols = Math.max(1, Math.floor(columns));
  const result: number[][] = Array.from({ length: cols }, () => []);
  const heights = new Array<number>(cols).fill(0);

  dims.forEach((d, i) => {
    // Unit-width height; missing/invalid dims fall back to a square (1) so the
    // tile is still placed rather than dropped.
    const h = d && d.width > 0 && d.height > 0 ? d.height / d.width : 1;
    let min = 0;
    for (let c = 1; c < cols; c++) {
      if (heights[c]! < heights[min]!) min = c;
    }
    result[min]!.push(i);
    heights[min]! += h;
  });

  return result;
}
