import { describe, it, expect } from 'vitest';
import { GpxError, parseGpx } from './gpx.js';
import { makeGpx } from '../../tests/gpx.js';

const T0 = Date.UTC(2026, 8, 12, 8, 0);
const buf = (s: string): Buffer => Buffer.from(s, 'utf8');

const pt = (lat: number, lon: number, inner: string): string =>
  `<trkpt lat="${lat}" lon="${lon}">${inner}</trkpt>`;
const time = (s: number): string => `<time>${new Date(T0 + s * 1000).toISOString()}</time>`;
const gpx11 = (body: string): string =>
  `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;

describe('parseGpx', () => {
  it('reads name and timed points from a GPX 1.1 file', () => {
    const { name, points } = parseGpx(buf(makeGpx({ points: 3, name: 'Morgenlauf' })));
    expect(name).toBe('Morgenlauf');
    expect(points).toEqual([
      { lat: 69.8, lon: 20.7, ele: 10, t: T0 },
      { lat: 69.8001, lon: 20.7, ele: 11, t: T0 + 5000 },
      { lat: 69.8002, lon: 20.7, ele: 12, t: T0 + 10_000 },
    ]);
  });

  it('concatenates all segments of all tracks', () => {
    const xml = gpx11(
      `<trk><trkseg>${pt(1, 2, time(0))}${pt(1.1, 2, time(1))}</trkseg>` +
        `<trkseg>${pt(1.2, 2, time(2))}</trkseg></trk>` +
        `<trk><trkseg>${pt(1.3, 2, time(3))}</trkseg></trk>`,
    );
    expect(parseGpx(buf(xml)).points.map((p) => p.lat)).toEqual([1, 1.1, 1.2, 1.3]);
  });

  it('ignores device extensions (Garmin/COROS style)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Garmin Connect" version="1.1" xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><time>2026-09-12T07:00:00Z</time></metadata>
  <trk><name>Skjervøy Lauf</name><type>running</type><trkseg>
    <trkpt lat="69.8" lon="20.7"><ele>5.2</ele>${time(0)}
      <extensions><ns3:TrackPointExtension><ns3:hr>120</ns3:hr><ns3:time>x</ns3:time></ns3:TrackPointExtension></extensions>
    </trkpt>
    <trkpt lat="69.8001" lon="20.7"><ele>6.0</ele>${time(1)}</trkpt>
  </trkseg></trk>
</gpx>`;
    const { name, points } = parseGpx(buf(xml));
    expect(name).toBe('Skjervøy Lauf');
    expect(points).toEqual([
      { lat: 69.8, lon: 20.7, ele: 5.2, t: T0 },
      { lat: 69.8001, lon: 20.7, ele: 6, t: T0 + 1000 },
    ]);
  });

  it('reads files with a prefixed GPX namespace', () => {
    const xml = `<gpx:gpx xmlns:gpx="http://www.topografix.com/GPX/1/1"><gpx:trk><gpx:trkseg>
      <gpx:trkpt lat="1" lon="2"><gpx:ele>3</gpx:ele><gpx:time>${new Date(T0).toISOString()}</gpx:time></gpx:trkpt>
      <gpx:trkpt lat="1.1" lon="2"><gpx:time>${new Date(T0 + 1000).toISOString()}</gpx:time></gpx:trkpt>
    </gpx:trkseg></gpx:trk></gpx:gpx>`;
    expect(parseGpx(buf(xml)).points).toEqual([
      { lat: 1, lon: 2, ele: 3, t: T0 },
      { lat: 1.1, lon: 2, ele: null, t: T0 + 1000 },
    ]);
  });

  it('accepts a UTF-8 byte order mark and returns an empty name when none is set', () => {
    const xml = gpx11(`<trk><trkseg>${pt(1, 2, time(0))}${pt(1.1, 2, time(1))}</trkseg></trk>`);
    const parsed = parseGpx(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf(xml)]));
    expect(parsed.name).toBe('');
    expect(parsed.points).toHaveLength(2);
  });

  it('drops duplicate and out-of-order times', () => {
    const xml = gpx11(
      `<trk><trkseg>${pt(1, 2, time(0))}${pt(1.1, 2, time(0))}${pt(1.2, 2, time(5))}` +
        `${pt(1.3, 2, time(3))}${pt(1.4, 2, time(6))}</trkseg></trk>`,
    );
    expect(parseGpx(buf(xml)).points.map((p) => p.lat)).toEqual([1, 1.2, 1.4]);
  });

  it('skips points with invalid coordinates', () => {
    const xml = gpx11(
      `<trk><trkseg>${pt(1, 2, time(0))}<trkpt lat="x" lon="2">${time(1)}</trkpt>` +
        `${pt(91, 2, time(2))}${pt(1.1, 2, time(3))}</trkseg></trk>`,
    );
    expect(parseGpx(buf(xml)).points.map((p) => p.lat)).toEqual([1, 1.1]);
  });

  it('rejects GPX without timestamps', () => {
    expect(() => parseGpx(buf(makeGpx({ withTime: false })))).toThrow(
      new GpxError('GPX ohne Zeitstempel wird nicht unterstützt'),
    );
  });

  it('rejects GPX where most points lack a time', () => {
    const xml = gpx11(
      `<trk><trkseg>${pt(1, 2, time(0))}${pt(1.1, 2, time(1))}${pt(1.2, 2, '')}` +
        `${pt(1.3, 2, '')}${pt(1.4, 2, '')}</trkseg></trk>`,
    );
    expect(() => parseGpx(buf(xml))).toThrow('GPX ohne Zeitstempel wird nicht unterstützt');
  });

  it('rejects GPX without track points (e.g. routes only)', () => {
    const xml = gpx11(`<rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2"/></rte>`);
    expect(() => parseGpx(buf(xml))).toThrow(new GpxError('GPX enthält keine Trackpunkte'));
  });

  it('rejects files that are not GPX', () => {
    expect(() => parseGpx(buf('<html><body>nope</body></html>'))).toThrow(
      new GpxError('Keine GPX-Datei'),
    );
    expect(() => parseGpx(buf('just text'))).toThrow(GpxError);
  });
});
