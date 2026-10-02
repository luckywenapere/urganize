import { describe, expect, it } from 'vitest';

import { CONNECTION_DROPPED_NOTE, readStreamedTurn } from './stream-client';
import { encodeStreamEvent, type UrgansStreamEvent } from './stream-protocol';

const final: UrgansStreamEvent = {
  type: 'final',
  data: { mode: 'agent', reply: 'Done.', clientActions: [], pendingConfirmation: null },
};

function responseOf(pieces: string[], failAfter?: Error): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < pieces.length) {
        controller.enqueue(encoder.encode(pieces[index]));
        index += 1;
      } else if (failAfter) {
        controller.error(failAfter);
      } else {
        controller.close();
      }
    },
  });
  return new Response(body);
}

const record = () => {
  const calls: string[] = [];
  return {
    calls,
    handlers: {
      onText: (d: string) => calls.push(`text:${d}`),
      onReset: () => calls.push('reset'),
    },
  };
};

describe('readStreamedTurn', () => {
  it('reports each piece as it arrives and returns the final answer', async () => {
    const { calls, handlers } = record();
    const body = [{ type: 'text', delta: 'Hel' }, { type: 'text', delta: 'lo' }, final] as UrgansStreamEvent[];

    const result = await readStreamedTurn(responseOf(body.map(encodeStreamEvent)), handlers);

    expect(calls).toEqual(['text:Hel', 'text:lo']);
    expect(result.final).toEqual(final.data);
    expect(result.text).toBe('Hello');
  });

  it('applies a reset to the text it is holding', async () => {
    const { calls, handlers } = record();
    const body = [
      { type: 'text', delta: 'Let me check.' },
      { type: 'reset' },
      { type: 'text', delta: 'Found it.' },
      final,
    ] as UrgansStreamEvent[];

    const result = await readStreamedTurn(responseOf(body.map(encodeStreamEvent)), handlers);

    expect(calls).toEqual(['text:Let me check.', 'reset', 'text:Found it.']);
    expect(result.text).toBe('Found it.');
  });

  it('copes with a line split across pieces of the body', async () => {
    const { handlers } = record();
    const line = encodeStreamEvent(final);

    const result = await readStreamedTurn(responseOf([line.slice(0, 9), line.slice(9)]), handlers);

    expect(result.final).toEqual(final.data);
  });

  it('returns what arrived, and no final, when the connection drops', async () => {
    const { handlers } = record();
    const piece = encodeStreamEvent({ type: 'text', delta: 'Half an ans' });

    const result = await readStreamedTurn(responseOf([piece], new Error('reset')), handlers);

    expect(result.final).toBeNull();
    expect(result.text).toBe('Half an ans');
  });

  it('returns nothing for a response with no body', async () => {
    const { handlers } = record();

    const result = await readStreamedTurn(new Response(null), handlers);

    expect(result).toEqual({ final: null, text: '' });
  });

  it('has a note for a dropped connection that says what to do', () => {
    expect(CONNECTION_DROPPED_NOTE).toMatch(/carry on/i);
  });
});
