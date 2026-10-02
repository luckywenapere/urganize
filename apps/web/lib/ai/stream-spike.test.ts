import { describe, expect, it } from 'vitest';

import {
  SseReader,
  StreamAccumulator,
  approxTokens,
  expectedAbortCosts,
  interestingHeaders,
  summarizeStreamText,
} from './stream-spike';

const sse = (...payloads: unknown[]) =>
  payloads.map((p) => `data: ${typeof p === 'string' ? p : JSON.stringify(p)}\n\n`).join('');

const text = (content: string, finish: string | null = null) => ({
  choices: [{ delta: { content }, finish_reason: finish }],
});

describe('SseReader', () => {
  it('returns each complete event and holds an unfinished one for later', () => {
    const reader = new SseReader();
    expect(reader.feed('data: {"a":1}\n\ndata: {"b"')).toEqual(['{"a":1}']);
    expect(reader.feed(':2}\n\n')).toEqual(['{"b":2}']);
  });

  it('copes with CRLF, comment lines and a missing final blank line', () => {
    const reader = new SseReader();
    expect(reader.feed(': keep-alive\r\n\r\ndata: one\r\n\r\ndata: two')).toEqual(['one']);
    expect(reader.flush()).toEqual(['two']);
  });

  it('joins an event whose data spans several lines', () => {
    expect(new SseReader().feed('data: a\ndata: b\n\n')).toEqual(['a\nb']);
  });

  it('is happy to be fed one character at a time', () => {
    const reader = new SseReader();
    const out: string[] = [];
    for (const ch of 'data: {"x":1}\n\ndata: [DONE]\n\n') out.push(...reader.feed(ch));
    expect(out).toEqual(['{"x":1}', '[DONE]']);
  });
});

describe('summarizeStreamText', () => {
  it('joins text pieces and notes where the first one arrived', () => {
    const summary = summarizeStreamText(
      sse({ choices: [{ delta: { role: 'assistant' } }] }, text('Hel'), text('lo', 'stop'), '[DONE]')
    );
    expect(summary.content).toBe('Hello');
    expect(summary.firstContentChunk).toBe(1);
    expect(summary.finishReason).toBe('stop');
    expect(summary.done).toBe(true);
    expect(summary.chunks).toBe(3);
  });

  it('puts a tool call back together from its pieces', () => {
    const summary = summarizeStreamText(
      sse(
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'get_', arguments: '' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'weather', arguments: '{"ci' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ty":"Lagos"}' } }] } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        '[DONE]'
      )
    );
    expect(summary.toolCalls).toEqual([
      { index: 0, id: 'call_1', name: 'get_weather', arguments: '{"city":"Lagos"}', argumentsParse: true },
    ]);
    expect(summary.finishReason).toBe('tool_calls');
  });

  it('keeps two parallel tool calls apart by index', () => {
    const summary = summarizeStreamText(
      sse({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 1, id: 'b', function: { name: 'two', arguments: '{}' } },
                { index: 0, id: 'a', function: { name: 'one', arguments: '{}' } },
              ],
            },
          },
        ],
      })
    );
    expect(summary.toolCalls.map((c) => c.name)).toEqual(['one', 'two']);
  });

  it('flags tool arguments that do not parse once assembled', () => {
    const summary = summarizeStreamText(
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'f', arguments: '{"a":' } }] } }] })
    );
    expect(summary.toolCalls[0].argumentsParse).toBe(false);
  });

  it('reads usage from a final chunk that has no choices', () => {
    const summary = summarizeStreamText(
      sse(text('Hi', 'stop'), {
        choices: [],
        usage: { prompt_tokens: 100, completion_tokens: 7, total_tokens: 107, prompt_tokens_details: { cached_tokens: 64 } },
      })
    );
    expect(summary.usage).toEqual({ promptTokens: 100, completionTokens: 7, totalTokens: 107 });
    expect(summary.cachedTokens).toBe(64);
  });

  it('reports no usage when the stream never sends any', () => {
    expect(summarizeStreamText(sse(text('Hi', 'stop'))).usage).toBeNull();
  });

  it('counts a bad line instead of throwing, and reports an error object', () => {
    const summary = summarizeStreamText(sse('not json', { error: { message: 'upstream blew up' } }));
    expect(summary.malformedLines).toBe(1);
    expect(summary.streamError).toBe('upstream blew up');
  });

  it('says a stream with no [DONE] did not finish cleanly', () => {
    expect(summarizeStreamText(sse(text('Hi'))).done).toBe(false);
  });
});

describe('StreamAccumulator', () => {
  it('knows when text has started, so an abort can be timed from it', () => {
    const acc = new StreamAccumulator();
    expect(acc.hasContent).toBe(false);
    acc.push(JSON.stringify(text('Once')));
    expect(acc.hasContent).toBe(true);
    expect(acc.contentLength).toBe(4);
  });
});

describe('expectedAbortCosts', () => {
  it('separates "billed what was written" from "billed the whole cap"', () => {
    const costs = expectedAbortCosts({
      promptTokens: 50,
      cap: 4000,
      writtenTokens: 150,
      rodiPerMillionIn: 1856,
      rodiPerMillionOut: 11137,
    });
    expect(costs.writtenRodi).toBeCloseTo(1.76, 1);
    expect(costs.fullCapRodi).toBeCloseTo(44.64, 1);
    expect(costs.fullCapRodi).toBeGreaterThan(costs.writtenRodi * 10);
  });

  it('turns characters into a token estimate', () => {
    expect(approxTokens(400)).toBe(100);
  });
});

describe('interestingHeaders', () => {
  it('keeps cost, limit and cache headers and drops the rest', () => {
    const headers = new Headers({
      'x-rodi-cost': '1.2',
      'x-ratelimit-remaining-requests': '9',
      'content-type': 'text/event-stream',
      'x-request-id': 'abc',
    });
    expect(Object.keys(interestingHeaders(headers)).sort()).toEqual([
      'x-ratelimit-remaining-requests',
      'x-request-id',
      'x-rodi-cost',
    ]);
  });
});
