import { describe, it, expect } from 'vitest';
import { fmtDuration, fmtKm, fmtM, fmtOffset, niceStep, OFFSET_CHOICES } from './format.js';

describe('niceStep', () => {
  it('picks a 1/2/2.5/5 step giving about the target number of ticks', () => {
    expect(niceStep(2.5, 4)).toBe(1);
    expect(niceStep(298, 3)).toBe(100);
    expect(niceStep(19.5, 8)).toBe(2.5);
    expect(niceStep(40, 8)).toBe(5);
  });
});

describe('German track formatters', () => {
  it('formats kilometres with one decimal and a comma', () => {
    expect(fmtKm(19_520)).toBe('19,5 km');
    expect(fmtKm(800)).toBe('0,8 km');
    expect(fmtKm(0)).toBe('0,0 km');
  });

  it('formats metres rounded with a thousands dot', () => {
    expect(fmtM(1025.4)).toBe('1.025 m');
    expect(fmtM(12.6)).toBe('13 m');
  });

  it('formats UTC offsets', () => {
    expect(fmtOffset(0)).toBe('UTC±0');
    expect(fmtOffset(120)).toBe('UTC+2');
    expect(fmtOffset(330)).toBe('UTC+5:30');
    expect(fmtOffset(-570)).toBe('UTC−9:30');
  });

  it('formats durations as h:mm', () => {
    expect(fmtDuration(9_648_000)).toBe('2:41 h');
    expect(fmtDuration(59_000)).toBe('0:01 h');
  });

  it('offers −12 h to +14 h in 30 min steps', () => {
    expect(OFFSET_CHOICES[0]).toBe(-720);
    expect(OFFSET_CHOICES[OFFSET_CHOICES.length - 1]).toBe(840);
    expect(OFFSET_CHOICES).toHaveLength(53);
    expect(OFFSET_CHOICES).toContain(330);
  });
});
