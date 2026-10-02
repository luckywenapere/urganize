// The browser's half of a streamed UrgAns reply: reads the body of POST
// /api/urgans when it is a stream (lib/chappi/stream-protocol.ts) and reports
// what arrived. Kept out of the component so it can be tested with a real
// ReadableStream, and so the component only has to decide what to show.

import { StreamEventReader } from './stream-protocol';
import type { ChappiResponse } from './types';

export type StreamedTurn = {
  /** The answer, when the stream ended properly. Null means the connection dropped before it. */
  final: ChappiResponse | null;
  /** The text of the round in progress, as the screen would be showing it. Resets are applied. */
  text: string;
};

/** Said after a reply when the connection dropped before the answer was complete. */
export const CONNECTION_DROPPED_NOTE = 'I lost the connection before I could finish. Ask me to carry on and I will.';

export async function readStreamedTurn(
  response: Response,
  handlers: { onText: (delta: string) => void; onReset: () => void }
): Promise<StreamedTurn> {
  const body = response.body;
  if (!body) return { final: null, text: '' };

  const reader = new StreamEventReader();
  const decoder = new TextDecoder();
  let text = '';
  let final: ChappiResponse | null = null;

  const apply = (events: ReturnType<StreamEventReader['feed']>) => {
    for (const event of events) {
      if (event.type === 'text') {
        text += event.delta;
        handlers.onText(event.delta);
      } else if (event.type === 'reset') {
        text = '';
        handlers.onReset();
      } else {
        final = event.data;
      }
    }
  };

  const stream = body.getReader();
  try {
    for (;;) {
      const { value, done } = await stream.read();
      if (done) break;
      apply(reader.feed(decoder.decode(value, { stream: true })));
    }
    apply(reader.flush());
  } catch {
    // The connection dropped. Whatever arrived stands, and a missing `final` is
    // how the caller knows.
  }

  return { final, text };
}
