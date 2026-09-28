import * as cheerio from 'cheerio';
// cheerio's typings source the DOM node types from domhandler (a cheerio
// dependency); we only need the types, erased at build.
import type { AnyNode, Element } from 'domhandler';
import type { RawTrackPoint } from '@stb/shared';

/** A GPX problem the uploader can fix; its German message is shown as is. */
export class GpxError extends Error {
  override name = 'GpxError';
}

export interface ParsedGpx {
  name: string;
  points: RawTrackPoint[];
}

/** Tag name without namespace prefix (`ns3:hr` → `hr`, `gpx:trkpt` → `trkpt`). */
const localName = (el: Element): string => el.name.slice(el.name.indexOf(':') + 1);

/** In XML mode every element node has type 'tag'. */
const isElement = (c: AnyNode): c is Element => c.type === 'tag';

const childNamed = (el: Element, name: string): Element | undefined =>
  el.children.find((c): c is Element => isElement(c) && localName(c) === name);

/**
 * Parse a GPX file into timed points: all `trkpt` of all `trk`/`trkseg` in
 * document order, namespace prefixes ignored. Points with duplicate or
 * out-of-order times or invalid coordinates are dropped. GPX without
 * timestamps is rejected: the replay and photo placement need them.
 */
export function parseGpx(buffer: Buffer): ParsedGpx {
  const raw = buffer.toString('utf8');
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // strip a UTF-8 BOM
  const $ = cheerio.load(text, { xml: true });
  const elements = $('*').toArray().filter(isElement);
  const root = elements[0];
  if (!root || localName(root) !== 'gpx') throw new GpxError('Keine GPX-Datei');

  const trkpts = elements.filter((el) => localName(el) === 'trkpt');
  if (trkpts.length < 2) throw new GpxError('GPX enthält keine Trackpunkte');

  const trk = elements.find((el) => localName(el) === 'trk');
  const nameEl = trk && childNamed(trk, 'name');
  const name = nameEl ? $(nameEl).text().trim() : '';

  const points: RawTrackPoint[] = [];
  let timed = 0;
  for (const el of trkpts) {
    const timeEl = childNamed(el, 'time');
    const t = timeEl ? Date.parse($(timeEl).text().trim()) : NaN;
    if (Number.isNaN(t)) continue;
    timed++;
    const lat = parseFloat(el.attribs.lat ?? '');
    const lon = parseFloat(el.attribs.lon ?? '');
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) continue;
    const prev = points[points.length - 1];
    if (prev && t <= prev.t) continue;
    const eleEl = childNamed(el, 'ele');
    const ele = eleEl ? parseFloat($(eleEl).text()) : NaN;
    points.push({ lat, lon, ele: Number.isNaN(ele) ? null : ele, t });
  }
  if (timed < trkpts.length * 0.5 || points.length < 2) {
    throw new GpxError('GPX ohne Zeitstempel wird nicht unterstützt');
  }
  return { name, points };
}
