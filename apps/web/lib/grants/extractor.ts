// The one place a model reads a page for the grant finder.
//
// The caller hands in `complete`: a function that sends ONE request to a model and
// returns its raw reply. The request is the one `buildExtractionRequest` builds, so
// it has no tools, no functions and no way to act; there is nothing for an
// instruction hidden in a page to make the model do. The reply goes through
// `parseExtraction`, and the pipeline then checks every field against the page.
//
// It never throws. A model that fails, stalls or talks nonsense is a failed read of
// one page. The model's error message is not kept, because it could carry anything,
// a key included.

import { buildExtractionRequest, parseExtraction, type ExtractionRequest } from './extract';
import type { ExtractResult } from './pipeline';
import type { FetchedPage } from './types';

export type CompleteFn = (request: ExtractionRequest) => Promise<string>;

export const DEFAULT_EXTRACTION_TIMEOUT_MS = 45_000;

const TIMED_OUT = Symbol('timed out');

export function createModelExtractor(complete: CompleteFn, options: { timeoutMs?: number } = {}): (page: FetchedPage) => Promise<ExtractResult> {
  const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_EXTRACTION_TIMEOUT_MS;

  return async (page) => {
    const request = buildExtractionRequest(page);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    });

    let reply: string | typeof TIMED_OUT;
    try {
      reply = await Promise.race([complete(request), timeout]);
    } catch {
      return { ok: false, reason: 'model_failed' };
    } finally {
      clearTimeout(timer);
    }
    if (reply === TIMED_OUT) return { ok: false, reason: 'timeout' };

    const parsed = parseExtraction(typeof reply === 'string' ? reply : '');
    return parsed.ok ? { ok: true, fields: parsed.fields } : { ok: false, reason: parsed.reason };
  };
}
