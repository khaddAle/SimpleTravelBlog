import { describe, it, expect, vi } from 'vitest';
import {
  generateShortId,
  generateUniqueShortId,
  SHORT_ID_ALPHABET,
  SHORT_ID_LENGTH,
} from './shortId.js';

describe('generateShortId', () => {
  it('produces an id of the configured length', () => {
    expect(generateShortId()).toHaveLength(SHORT_ID_LENGTH);
  });

  it('uses only characters from the unambiguous alphabet', () => {
    const allowed = new Set(SHORT_ID_ALPHABET.split(''));
    for (let i = 0; i < 200; i++) {
      for (const ch of generateShortId()) {
        expect(allowed.has(ch)).toBe(true);
      }
    }
  });

  it('excludes visually ambiguous characters (0, 1, l, o)', () => {
    for (const ch of ['0', '1', 'l', 'o']) {
      expect(SHORT_ID_ALPHABET).not.toContain(ch);
    }
  });
});

describe('generateUniqueShortId', () => {
  it('returns the first id that does not already exist', async () => {
    const exists = vi.fn().mockResolvedValue(false);
    const id = await generateUniqueShortId(exists);
    expect(id).toHaveLength(SHORT_ID_LENGTH);
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('retries on collision until a free id is found', async () => {
    const exists = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    const id = await generateUniqueShortId(exists);
    expect(id).toHaveLength(SHORT_ID_LENGTH);
    expect(exists).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting the maximum number of attempts', async () => {
    const exists = vi.fn().mockResolvedValue(true);
    await expect(generateUniqueShortId(exists, 5)).rejects.toThrow(
      /unique short id/i,
    );
    expect(exists).toHaveBeenCalledTimes(5);
  });
});
