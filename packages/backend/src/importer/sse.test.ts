import { describe, expect, it } from 'vitest';
import { drainSseEvents } from './sse.js';

describe('drainSseEvents', () => {
  it('parses a complete data event and leaves no remainder', () => {
    const { events, rest } = drainSseEvents('data: {"type":"done"}\n');
    expect(events).toEqual([{ type: 'done' }]);
    expect(rest).toBe('');
  });

  it('parses multiple events from one buffer', () => {
    const { events, rest } = drainSseEvents(
      'data: {"type":"progress","message":"x"}\ndata: {"type":"done"}\n',
    );
    expect(events).toEqual([{ type: 'progress', message: 'x' }, { type: 'done' }]);
    expect(rest).toBe('');
  });

  it('ignores SSE comments and blank lines', () => {
    const { events } = drainSseEvents(': keep-alive\n\ndata: {"type":"done"}\n');
    expect(events).toEqual([{ type: 'done' }]);
  });

  it('keeps a partial trailing data line in rest without throwing', () => {
    // Regression: a data event split mid-JSON across network chunks must not
    // be parsed yet — it would throw "Unterminated string in JSON".
    const partial = 'data: {"type":"progr';
    const { events, rest } = drainSseEvents(partial);
    expect(events).toEqual([]);
    expect(rest).toBe(partial);
  });

  it('reassembles an event split across two chunks', () => {
    let buf = 'data: {"type":"prog';
    let drained = drainSseEvents(buf);
    buf = drained.rest;
    expect(drained.events).toEqual([]);

    buf += 'ress","message":"resizing"}\n';
    drained = drainSseEvents(buf);
    buf = drained.rest;
    expect(drained.events).toEqual([{ type: 'progress', message: 'resizing' }]);
    expect(buf).toBe('');
  });

  it('surfaces an error event with its message', () => {
    const { events } = drainSseEvents('data: {"type":"error","message":"boom"}\n');
    expect(events).toEqual([{ type: 'error', message: 'boom' }]);
  });
});
