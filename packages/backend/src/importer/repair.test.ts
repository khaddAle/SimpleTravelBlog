import { describe, it, expect } from 'vitest';
import type { Block } from '@stb/shared';
import { planRepair, matchLiveHead, type LiveHead } from './repair.js';

const para = (t: string): Block => ({ type: 'paragraph', text: t });
const img = (id: string): Block => ({ type: 'image', imageId: id });
const gal = (...ids: string[]): Block => ({ type: 'gallery', imageIds: ids });

describe('planRepair', () => {
  it('returns noop when live already equals corrected', () => {
    const blocks = [para('a'), img('x'), para('b')];
    const plan = planRepair(blocks, blocks);
    expect(plan.status).toBe('noop');
    expect(plan.addedImageIds).toEqual([]);
  });

  it('returns noop for distinct-but-equal posts containing a gallery', () => {
    const live = [para('p'), gal('a', 'b', 'c')];
    const corrected = [para('p'), gal('a', 'b', 'c')];
    expect(planRepair(live, corrected).status).toBe('noop');
  });

  it('applies recovered images when text matches and live is missing an image', () => {
    const live = [para('Intro'), img('keep'), para('Outro')];
    const corrected = [para('Intro'), img('keep'), img('recovered'), para('Outro')];
    const plan = planRepair(live, corrected);
    expect(plan.status).toBe('apply');
    expect(plan.addedImageIds).toEqual(['recovered']);
    expect(plan.mergedBlocks).toEqual(corrected);
  });

  it('detects a recovered image that grows an existing gallery', () => {
    const live = [para('p'), gal('a', 'b', 'c')];
    const corrected = [para('p'), gal('a', 'b', 'c', 'd')];
    const plan = planRepair(live, corrected);
    expect(plan.status).toBe('apply');
    expect(plan.addedImageIds).toEqual(['d']);
  });

  it('flags divergence when a live paragraph was edited', () => {
    const live = [para('Komplett anders formuliert'), img('x')];
    const corrected = [para('Originaltext'), img('x')];
    const plan = planRepair(live, corrected);
    expect(plan.status).toBe('diverged');
    expect(plan.addedImageIds).toEqual([]);
  });

  it('ignores whitespace/segmentation differences in the text guard', () => {
    // The old import merged text into one paragraph; the fix splits it around a
    // recovered image. Same words → not an edit, safe to apply.
    const live = [para('Vor dem Bild nach dem Bild')];
    const corrected = [para('Vor dem Bild'), img('new'), para('nach dem Bild')];
    const plan = planRepair(live, corrected);
    expect(plan.status).toBe('apply');
    expect(plan.addedImageIds).toEqual(['new']);
  });

  it('flags divergence when live has an image absent from the corpus mapping', () => {
    // e.g. the user uploaded a new image into the post after import.
    const live = [para('p'), img('user-added')];
    const corrected = [para('p')];
    const plan = planRepair(live, corrected);
    expect(plan.status).toBe('diverged');
  });
});

describe('matchLiveHead', () => {
  const head = (id: string, title: string, postDate: string): LiveHead => ({ id, title, postDate });

  it('matches a single live post with the same title', () => {
    const heads = [
      head('aaa111', 'Und nun die Tagesthemen', '2016-06-30T18:00:00.000Z'),
      head('bbb222', 'Ein anderer Beitrag', '2016-07-01T18:00:00.000Z'),
    ];
    const r = matchLiveHead(heads, { title: 'Und nun die Tagesthemen', postDate: '2016-06-30T18:00:00.000Z' });
    expect(r.status).toBe('matched');
    expect(r.shortId).toBe('aaa111');
  });

  it('tolerates whitespace and case differences in the title', () => {
    const heads = [head('aaa111', 'Und nun  die Tagesthemen', '2016-06-30T18:00:00.000Z')];
    const r = matchLiveHead(heads, { title: '  und nun die tagesthemen  ', postDate: '2016-06-30T18:00:00.000Z' });
    expect(r.status).toBe('matched');
    expect(r.shortId).toBe('aaa111');
  });

  it('reports unmatched when no title matches', () => {
    const heads = [head('aaa111', 'Etwas ganz anderes', '2016-06-30T18:00:00.000Z')];
    const r = matchLiveHead(heads, { title: 'Und nun die Tagesthemen', postDate: '2016-06-30T18:00:00.000Z' });
    expect(r.status).toBe('unmatched');
    expect(r.shortId).toBeUndefined();
  });

  it('disambiguates duplicate titles by postDate', () => {
    const heads = [
      head('aaa111', 'Tag 1', '2016-06-30T18:00:00.000Z'),
      head('bbb222', 'Tag 1', '2017-08-01T18:00:00.000Z'),
    ];
    const r = matchLiveHead(heads, { title: 'Tag 1', postDate: '2017-08-01T18:00:00.000Z' });
    expect(r.status).toBe('matched');
    expect(r.shortId).toBe('bbb222');
  });

  it('reports ambiguous when duplicate titles cannot be split by postDate', () => {
    const heads = [
      head('aaa111', 'Tag 1', '2016-06-30T18:00:00.000Z'),
      head('bbb222', 'Tag 1', '2016-06-30T18:00:00.000Z'),
    ];
    const r = matchLiveHead(heads, { title: 'Tag 1', postDate: '2016-06-30T18:00:00.000Z' });
    expect(r.status).toBe('ambiguous');
    expect(r.candidates).toEqual(['aaa111', 'bbb222']);
  });
});
