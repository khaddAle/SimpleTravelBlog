import { describe, it, expect } from 'vitest';
import { cardLayout, ZOOM_CONTROL_SPACE } from './card.js';

describe('cardLayout', () => {
  it('puts the card on the side away from its point', () => {
    // Point bottom-left: card top-right.
    const a = cardLayout({ x: 100, y: 500 }, 1000, 600, 0.75);
    expect(a.left + a.width).toBe(1000 - 12);
    expect(a.top).toBe(12);
    // Point top-right: card bottom-left, clear of the zoom control.
    const b = cardLayout({ x: 900, y: 100 }, 1000, 600, 0.75);
    expect(b.left).toBe(ZOOM_CONTROL_SPACE);
    expect(b.top + b.height).toBe(600 - 12);
  });

  it('is about a third of the map wide, within 180–300 px', () => {
    expect(cardLayout({ x: 0, y: 0 }, 1000, 800, 0.75).width).toBe(300);
    expect(cardLayout({ x: 0, y: 0 }, 600, 800, 0.75).width).toBeCloseTo(216);
    expect(cardLayout({ x: 0, y: 0 }, 360, 800, 0.75).width).toBe(180);
  });

  it('never grows taller than the map', () => {
    const l = cardLayout({ x: 0, y: 0 }, 1000, 300, 1.5);
    expect(l.height).toBeLessThanOrEqual(300 - 24);
  });

  it('draws the leader from the nearest card edge to the point', () => {
    const l = cardLayout({ x: 100, y: 500 }, 1000, 600, 0.75);
    expect(l.leader).toEqual({ x1: l.left, y1: l.top + l.height, x2: 100, y2: 500 });
  });
});
