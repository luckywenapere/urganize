/**
 * The pieces of the streaming spike that are about the spike and not about
 * reading a stream: what an aborted request should have cost, and which response
 * headers are worth printing. The reader itself lives in sse-stream.ts and is
 * re-exported here so the spike's imports stay as they were.
 */
export * from './sse-stream';

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
