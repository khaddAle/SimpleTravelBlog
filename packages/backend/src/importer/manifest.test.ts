import { describe, expect, it } from 'vitest';
import { manifestFilename, parseManifest } from './manifest.js';

describe('parseManifest', () => {
  it('accepts an empty object', () => {
    expect(parseManifest({})).toEqual({});
  });

  it('accepts a source-url → imageId mapping', () => {
    const m = { 'https://old.example.com/a.jpg': 'abc123', 'https://old.example.com/b.jpg': 'def456' };
    expect(parseManifest(m)).toEqual(m);
  });

  it('rejects non-string values', () => {
    expect(() => parseManifest({ 'https://old.example.com/a.jpg': 42 })).toThrow();
  });

  it('rejects a non-object payload', () => {
    expect(() => parseManifest('nope')).toThrow();
    expect(() => parseManifest(null)).toThrow();
  });
});

describe('manifestFilename', () => {
  it('namespaces the manifest by target host so dev/prod imageIds never collide', () => {
    expect(manifestFilename('https://dev-reisen.caro-alex.de')).toBe('manifest-dev-reisen.caro-alex.de.json');
    expect(manifestFilename('https://reisen.caro-alex.de')).toBe('manifest-reisen.caro-alex.de.json');
  });

  it('keeps the port in the host (different ports are different targets)', () => {
    expect(manifestFilename('http://localhost:4000')).toBe('manifest-localhost_4000.json');
  });

  it('sanitises characters not safe for filenames', () => {
    expect(manifestFilename('http://localhost:4000')).not.toContain(':');
  });

  it('falls back to a placeholder for an unparseable url', () => {
    expect(manifestFilename('not a url')).toBe('manifest-unknown.json');
  });
});
