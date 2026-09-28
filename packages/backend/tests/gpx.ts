/**
 * Synthetic GPX for tests: a straight walk due north, ~11.1 m (1e-4°) per
 * point every 5 s, climbing 1 m per point. Deterministic and small.
 */
export interface GpxOptions {
  points?: number;
  name?: string;
  /** Emit <time> per point (default true). */
  withTime?: boolean;
  startUtc?: number;
}

export function makeGpx({
  points = 60,
  name = 'Testlauf',
  withTime = true,
  startUtc = Date.UTC(2026, 8, 12, 8, 0),
}: GpxOptions = {}): string {
  const pts: string[] = [];
  for (let i = 0; i < points; i++) {
    const time = withTime
      ? `<time>${new Date(startUtc + i * 5000).toISOString().replace('.000', '')}</time>`
      : '';
    pts.push(
      `<trkpt lat="${(69.8 + i * 1e-4).toFixed(6)}" lon="20.7"><ele>${10 + i}</ele>${time}</trkpt>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${name}</name><trkseg>
${pts.join('\n')}
</trkseg></trk></gpx>
`;
}
