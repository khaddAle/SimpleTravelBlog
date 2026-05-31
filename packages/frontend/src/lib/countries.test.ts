import { describe, it, expect } from 'vitest';
import { countryName } from './countries.js';

describe('countryName', () => {
  it('maps an ISO 3166-1 alpha-2 code to its German country name', () => {
    expect(countryName('IT')).toBe('Italien');
    expect(countryName('AT')).toBe('Österreich');
    expect(countryName('DE')).toBe('Deutschland');
    expect(countryName('NO')).toBe('Norwegen');
  });

  it('accepts lowercase codes', () => {
    expect(countryName('fr')).toBe('Frankreich');
  });

  it('returns malformed (non two-letter) input unchanged', () => {
    expect(countryName('')).toBe('');
    expect(countryName('Italien')).toBe('Italien');
    expect(countryName('I')).toBe('I');
  });
});
