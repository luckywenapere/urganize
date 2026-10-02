/**
 * The pure half of the streaming spike: reads an OpenAI-style server-sent-event
 * stream and boils it down to the facts the streaming decision turns on.
 *
 * Nothing here touches the network. `stream-spike.integration.test.ts` feeds it
 * what RodiumAi really sends; `stream-spike.test.ts` feeds it hand-written
 * streams, so the reading itself is checked without a key.
 *
 * It is a spike, not production code: if streaming ships, the runner gets its
 * own reader and this file is the thing to promote or delete.
 */

export type StreamedToolCall = {
  index: number;
  id: string | null;
  name: string;
  arguments: string;
  /** The arguments, put back together from the pieces, parse as JSON (or are empty). */
  argumentsParse: boolean;
};

export type StreamSummary = {
  /** Data lines read, not counting [DONE]. */
  chunks: number;
  /** Index of the first chunk that carried visible text. -1 when none did. */
  firstContentChunk: number;
  content: string;
  toolCalls: StreamedToolCall[];
  finishReason: string | null;
  /** Token usage, if any chunk carried it (it normally rides a last chunk with no choices). */
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null } | null;
  cachedTokens: number | null;
  /** The stream ended with `data: [DONE]`. */
  done: boolean;
  /** A line that was not valid JSON, so a reader can tell "malformed" from "empty". */
  malformedLines: number;
  /** An error object the gateway sent in the middle of the stream, if it did. */
  streamError: string | null;
};

type Delta = {
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

type Chunk = {
  choices?: Array<{ delta?: Delta; finish_reason?: string | null }>;
  usage?: Record<string, unknown> | null;
  error?: { message?: string } | string;
};

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Splits raw text into complete server-sent-event "data" payloads and keeps the
 * unfinished tail for the next call. Handles \r\n and \n, comment lines (":"),
 * and an event whose data spans several lines.
 */
export class SseReader {
  private buffer = '';

  /** Feed the next piece of the body; returns the data payloads that are now complete. */
  feed(piece: string): string[] {
    this.buffer += piece;
    const out: string[] = [];
    // An event ends at a blank line.
    for (;;) {
      const match = /\r?\n\r?\n/.exec(this.buffer);
      if (!match) break;
      const event = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data = dataOf(event);
      if (data !== null) out.push(data);
    }
    return out;
  }

  /** What is left when the body ends without a final blank line. */
  flush(): string[] {
    const rest = this.buffer;
    this.buffer = '';
    if (!rest.trim()) return [];
    const data = dataOf(rest);
    return data === null ? [] : [data];
  }
}

function dataOf(event: string): string | null {
  const lines = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  return lines.length > 0 ? lines.join('\n') : null;
}

/** Folds data payloads into a summary, one payload at a time. */
export class StreamAccumulator {
  private chunks = 0;
  private firstContentChunk = -1;
  private content = '';
  private finishReason: string | null = null;
  private usage: StreamSummary['usage'] = null;
  private cachedTokens: number | null = null;
  private done = false;
  private malformed = 0;
  private streamError: string | null = null;
  private readonly calls = new Map<number, { id: string | null; name: string; arguments: string }>();

  /** True once a chunk with visible text has been read; the spike uses it to time an abort. */
  get hasContent(): boolean {
    return this.firstContentChunk >= 0;
  }

  get contentLength(): number {
    return this.content.length;
  }

  push(data: string): void {
    const trimmed = data.trim();
    if (trimmed === '[DONE]') {
      this.done = true;
      return;
    }

    let chunk: Chunk;
    try {
      chunk = JSON.parse(trimmed) as Chunk;
    } catch {
      this.malformed += 1;
      return;
    }
    this.chunks += 1;

    if (chunk.error) {
      this.streamError = typeof chunk.error === 'string' ? chunk.error : String(chunk.error.message ?? 'error');
    }

    const usage = chunk.usage;
    if (usage && typeof usage === 'object') {
      this.usage = {
        promptTokens: numberOrNull(usage.prompt_tokens),
        completionTokens: numberOrNull(usage.completion_tokens),
        totalTokens: numberOrNull(usage.total_tokens),
      };
      const details = usage.prompt_tokens_details as { cached_tokens?: unknown } | undefined;
      this.cachedTokens = numberOrNull(details?.cached_tokens) ?? numberOrNull(usage.cached_tokens);
    }

    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) this.finishReason = choice.finish_reason;

    const delta = choice.delta;
    if (!delta) return;

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      if (this.firstContentChunk < 0) this.firstContentChunk = this.chunks - 1;
      this.content += delta.content;
    }

    for (const piece of delta.tool_calls ?? []) {
      const index = typeof piece.index === 'number' ? piece.index : 0;
      const call = this.calls.get(index) ?? { id: null, name: '', arguments: '' };
      if (piece.id) call.id = piece.id;
      if (piece.function?.name) call.name += piece.function.name;
      if (piece.function?.arguments) call.arguments += piece.function.arguments;
      this.calls.set(index, call);
    }
  }

  summary(): StreamSummary {
    const toolCalls = [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, call]): StreamedToolCall => {
        let argumentsParse = true;
        if (call.arguments.trim()) {
          try {
            JSON.parse(call.arguments);
          } catch {
            argumentsParse = false;
          }
        }
        return { index, id: call.id, name: call.name, arguments: call.arguments, argumentsParse };
      });

    return {
      chunks: this.chunks,
      firstContentChunk: this.firstContentChunk,
      content: this.content,
      toolCalls,
      finishReason: this.finishReason,
      usage: this.usage,
      cachedTokens: this.cachedTokens,
      done: this.done,
      malformedLines: this.malformed,
      streamError: this.streamError,
    };
  }
}

/** Convenience: read a whole stream held in memory (used by the offline tests). */
export function summarizeStreamText(text: string): StreamSummary {
  const reader = new SseReader();
  const accumulator = new StreamAccumulator();
  for (const data of [...reader.feed(text), ...reader.flush()]) accumulator.push(data);
  return accumulator.summary();
}

// ── What an abort should have cost ───────────────────────────────────────────

/**
 * The two figures an abort test compares the dashboard against. If the provider
 * bills only what was written, the aborted request costs `writtenRodi`; if it
 * reserves and bills the whole cap, it costs `fullCapRodi`. They are far apart
 * on purpose (a big cap, an early abort), so the dashboard balance tells them
 * apart without needing exact figures.
 */
export function expectedAbortCosts(params: {
  promptTokens: number;
  cap: number;
  writtenTokens: number;
  rodiPerMillionIn: number;
  rodiPerMillionOut: number;
}): { writtenRodi: number; fullCapRodi: number } {
  const input = (params.promptTokens * params.rodiPerMillionIn) / 1_000_000;
  const out = (tokens: number) => (tokens * params.rodiPerMillionOut) / 1_000_000;
  return {
    writtenRodi: Math.round((input + out(params.writtenTokens)) * 100) / 100,
    fullCapRodi: Math.round((input + out(params.cap)) * 100) / 100,
  };
}

/** Rough tokens from characters, for the abort figures only. */
export const approxTokens = (chars: number): number => Math.round(chars / 4);

/** Response headers worth printing: anything that could carry a cost, a balance or a limit. */
export function interestingHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (/(rod|cost|usage|bill|credit|balance|limit|remaining|request-id|cache|server|via)/i.test(name)) {
      out[name] = value.length > 120 ? `${value.slice(0, 120)}...` : value;
    }
  });
  return out;
}
