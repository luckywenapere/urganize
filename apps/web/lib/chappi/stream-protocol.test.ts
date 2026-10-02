import { describe, expect, it } from 'vitest';

import {
  StreamEventReader,
  URGANS_STREAM_CONTENT_TYPE,
  createTextBatcher,
  encodeStreamEvent,
  isStreamContentType,
  isUrgansStreamOn,
  requestWantsStream,
  type UrgansStreamEvent,
} from './stream-protocol';

const final: UrgansStreamEvent = {
  type: 'final',
  data: { mode: 'agent', reply: 'Done.', clientActions: [], pendingConfirmation: null },
};

describe('the stream flag', () => {
  it('is on only for the literal word on', () => {
    expect(isUrgansStreamOn({ URGANS_STREAM: 'on' })).toBe(true);
    expect(isUrgansStreamOn({ URGANS_STREAM: ' ON ' })).toBe(true);
    for (const value of ['true', '1', 'yes', 'shadow', '', undefined]) {
      expect(isUrgansStreamOn({ URGANS_STREAM: value })).toBe(false);
    }
    expect(isUrgansStreamOn({})).toBe(false);
  });

  it('reads the opt-in header, exactly', () => {
    const headers = (value: string | null) => ({ get: () => value });
    expect(requestWantsStream(headers('1'))).toBe(true);
    expect(requestWantsStream(headers(' 1 '))).toBe(true);
    expect(requestWantsStream(headers('true'))).toBe(false);
    expect(requestWantsStream(headers(null))).toBe(false);
  });

  it('recognises a stream response by its content type', () => {
    expect(isStreamContentType(`${URGANS_STREAM_CONTENT_TYPE}; charset=utf-8`)).toBe(true);
    expect(isStreamContentType('application/json')).toBe(false);
    expect(isStreamContentType(null)).toBe(false);
  });
});

describe('StreamEventReader', () => {
  it('reads whole events and round-trips what the encoder wrote', () => {
    const events: UrgansStreamEvent[] = [{ type: 'text', delta: 'Hel' }, { type: 'reset' }, final];
    const reader = new StreamEventReader();
    expect(reader.feed(events.map(encodeStreamEvent).join(''))).toEqual(events);
  });

  it('holds back a half-received line until the rest arrives', () => {
    const reader = new StreamEventReader();
    const line = encodeStreamEvent({ type: 'text', delta: 'wor' });
    expect(reader.feed(line.slice(0, 10))).toEqual([]);
    expect(reader.feed(line.slice(10))).toEqual([{ type: 'text', delta: 'wor' }]);
  });

  it('survives one character at a time', () => {
    const reader = new StreamEventReader();
    const out: UrgansStreamEvent[] = [];
    for (const ch of encodeStreamEvent(final)) out.push(...reader.feed(ch));
    expect(out).toEqual([final]);
  });

  it('keeps a newline that is inside a text delta (it is escaped in the JSON)', () => {
    const reader = new StreamEventReader();
    expect(reader.feed(encodeStreamEvent({ type: 'text', delta: 'a\nb' }))).toEqual([
      { type: 'text', delta: 'a\nb' },
    ]);
  });

  it('skips blank lines, bad JSON and unknown event types without throwing', () => {
    const reader = new StreamEventReader();
    const body = ['', 'not json', '{"type":"mystery","x":1}', '{"type":"text"}', encodeStreamEvent(final).trim(), ''].join('\n');
    expect(reader.feed(body)).toEqual([final]);
  });

  it('flushes a last line that had no newline', () => {
    const reader = new StreamEventReader();
    expect(reader.feed(JSON.stringify(final))).toEqual([]);
    expect(reader.flush()).toEqual([final]);
    expect(reader.flush()).toEqual([]);
  });
});

describe('createTextBatcher', () => {
  const setup = (intervalMs = 50) => {
    let time = 1_000;
    const scheduled: Array<{ run: () => void; at: number; live: boolean }> = [];
    const out: string[] = [];
    const batcher = createTextBatcher({
      emit: (text) => out.push(text),
      intervalMs,
      now: () => time,
      schedule: (run, ms) => {
        const entry = { run, at: time + ms, live: true };
        scheduled.push(entry);
        return entry;
      },
      cancel: (handle) => {
        (handle as { live: boolean }).live = false;
      },
    });
    const advance = (ms: number) => {
      time += ms;
      for (const entry of scheduled) {
        if (entry.live && entry.at <= time) {
          entry.live = false;
          entry.run();
        }
      }
    };
    return { batcher, out, advance };
  };

  it('hands on the first piece at once and batches what follows', () => {
    const { batcher, out, advance } = setup();
    batcher.push('a');
    expect(out).toEqual(['a']);
    batcher.push('b');
    batcher.push('c');
    expect(out).toEqual(['a']);
    advance(50);
    expect(out).toEqual(['a', 'bc']);
  });

  it('flushNow empties what is waiting and cancels the timer', () => {
    const { batcher, out, advance } = setup();
    batcher.push('a');
    batcher.push('b');
    batcher.flushNow();
    expect(out).toEqual(['a', 'b']);
    advance(500);
    expect(out).toEqual(['a', 'b']);
  });

  it('discard drops what has not been handed on', () => {
    const { batcher, out, advance } = setup();
    batcher.push('a');
    batcher.push('b');
    batcher.discard();
    advance(500);
    expect(out).toEqual(['a']);
  });

  it('ignores empty pieces', () => {
    const { batcher, out } = setup();
    batcher.push('');
    batcher.flushNow();
    expect(out).toEqual([]);
  });
});
