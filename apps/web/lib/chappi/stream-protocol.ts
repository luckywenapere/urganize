// The wire format between POST /api/urgans and the chat screen when a reply is
// streamed. Pure, and shared by both ends so they cannot disagree.
//
// One JSON object per line (newline-delimited JSON), because it is the simplest
// thing a fetch body reader can parse a piece at a time and a half-received line
// is trivially held back. Three kinds of event:
//
//   text   a piece of the reply to show now. Not final: the reply may still be
//          replaced, which is why the stream always ends with `final`.
//   reset  throw away what `text` showed so far. Sent when a new round or a
//          different model begins after text was already streamed, because the
//          text of the earlier round is not the reply.
//   final  the same payload the route has always answered with. This is the
//          reply, the actions and the approval card, and it is authoritative:
//          the client stores THIS, not the pieces it displayed.
//
// A stream that ends without `final` means the connection dropped or the
// function was cut off. The client treats that as a failure.
//
// Streaming is opt-in on both sides: the server needs URGANS_STREAM=on and the
// request has to ask with URGANS_STREAM_HEADER. Either missing, the route
// answers plain JSON as it always did, so an old client and a switched-off
// server both keep working.

import type { ChappiResponse } from './types';

export const URGANS_STREAM_HEADER = 'x-urgans-stream';
export const URGANS_STREAM_CONTENT_TYPE = 'application/x-ndjson';

export type UrgansStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reset' }
  | { type: 'final'; data: ChappiResponse };

/** True only for the literal word "on", the same rule AI_ROUTER follows. */
export function isUrgansStreamOn(env: Record<string, string | undefined> = process.env): boolean {
  return (env.URGANS_STREAM ?? '').trim().toLowerCase() === 'on';
}

/** Does this request ask for a streamed answer? */
export function requestWantsStream(headers: { get(name: string): string | null }): boolean {
  return (headers.get(URGANS_STREAM_HEADER) ?? '').trim() === '1';
}

/** Does this response carry a stream? Read off the response, never assumed. */
export function isStreamContentType(contentType: string | null | undefined): boolean {
  return (contentType ?? '').toLowerCase().includes(URGANS_STREAM_CONTENT_TYPE);
}

export function encodeStreamEvent(event: UrgansStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function parseEvent(line: string): UrgansStreamEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const event = value as { type?: unknown; delta?: unknown; data?: unknown };

  if (event.type === 'text' && typeof event.delta === 'string') {
    return { type: 'text', delta: event.delta };
  }
  if (event.type === 'reset') return { type: 'reset' };
  if (event.type === 'final' && event.data && typeof event.data === 'object') {
    return { type: 'final', data: event.data as ChappiResponse };
  }
  // An event type this client does not know is skipped rather than fatal, so a
  // newer server can add one without breaking an older client.
  return null;
}

/** Turns pieces of the body into whole events, holding back a half-received line. */
export class StreamEventReader {
  private buffer = '';

  feed(piece: string): UrgansStreamEvent[] {
    this.buffer += piece;
    const events: UrgansStreamEvent[] = [];
    for (;;) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      const event = parseEvent(line);
      if (event) events.push(event);
    }
    return events;
  }

  /** The last line, if the body ended without a final newline. */
  flush(): UrgansStreamEvent[] {
    const line = this.buffer.trim();
    this.buffer = '';
    if (!line) return [];
    const event = parseEvent(line);
    return event ? [event] : [];
  }
}

// ── Throttling the text the screen shows ─────────────────────────────────────

/**
 * Collects text pieces and hands them on at most once per `intervalMs`, so a
 * fast model does not re-render the transcript hundreds of times a second.
 * `flushNow` empties it immediately (used before the final reply replaces the
 * pieces). Time is injectable so the behaviour can be tested without waiting.
 */
export function createTextBatcher(params: {
  emit: (text: string) => void;
  intervalMs?: number;
  now?: () => number;
  schedule?: (run: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}) {
  const intervalMs = params.intervalMs ?? 60;
  const now = params.now ?? Date.now;
  const schedule = params.schedule ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const cancel = params.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let pending = '';
  let lastEmit = Number.NEGATIVE_INFINITY;
  let handle: unknown = null;

  const flushNow = () => {
    if (handle !== null) {
      cancel(handle);
      handle = null;
    }
    if (!pending) return;
    const text = pending;
    pending = '';
    lastEmit = now();
    params.emit(text);
  };

  return {
    push(piece: string) {
      if (!piece) return;
      pending += piece;
      const wait = lastEmit + intervalMs - now();
      if (wait <= 0) {
        flushNow();
        return;
      }
      if (handle === null) {
        handle = schedule(() => {
          handle = null;
          flushNow();
        }, wait);
      }
    },
    flushNow,
    /** Drops anything not yet handed on (the turn it belonged to is gone). */
    discard() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      pending = '';
    },
  };
}
