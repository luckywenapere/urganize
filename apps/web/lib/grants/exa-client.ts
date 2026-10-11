// One search call to Exa, and nothing else.
//
// Everything here is plain `fetch`: no SDK, no new dependency. The request body is
// built by one pure function and the response is read by another, so when the real
// shape is confirmed (Gate 0 in the plan) a change is a line or two, not a rewrite.
//
// Every detail below marked UNVERIFIED comes from memory of the vendor's public docs
// and has not been checked against a real call. Read the vendor's current docs and
// terms before the first real run.
//
// The key is only ever sent in a header. It is never put in a URL or a body, and it
// is scrubbed from every piece of text this file hands back, so it cannot reach a
// log or a report by way of an error message.
//
// `searchExa` never throws and never retries on its own. A rate limit comes back as a
// rate limit with the wait the vendor asked for, and the caller decides what to do.

import type { FetchedPage } from './types';

/** UNVERIFIED. */
export const EXA_SEARCH_URL = 'https://api.exa.ai/search';
/** UNVERIFIED. */
export const EXA_KEY_HEADER = 'x-api-key';

export const DEFAULT_RESULTS = 8;
export const MAX_RESULTS = 25;
/** Text asked for per result, and the most we keep of what comes back. */
export const MAX_RESULT_TEXT_CHARS = 12_000;
export const DEFAULT_SEARCH_TIMEOUT_MS = 20_000;

const MAX_DETAIL_CHARS = 200;

export function buildSearchBody(query: string, options: { numResults?: number } = {}): Record<string, unknown> {
  const wanted = typeof options.numResults === 'number' && Number.isFinite(options.numResults) ? Math.floor(options.numResults) : DEFAULT_RESULTS;
  const numResults = Math.min(MAX_RESULTS, Math.max(1, wanted));
  // UNVERIFIED shape: a query, a result count and page text capped at a size.
  return {
    query,
    type: 'auto',
    numResults,
    contents: { text: { maxCharacters: MAX_RESULT_TEXT_CHARS } },
  };
}

function isHttpLink(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Results into pages. Anything without a real link or with no text is dropped. */
export function normalizeExaResponse(body: unknown): FetchedPage[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  const seen = new Set<string>();
  const pages: FetchedPage[] = [];
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (!isHttpLink(record.url)) continue;
    if (typeof record.text !== 'string' || !record.text.trim()) continue;
    if (seen.has(record.url)) continue;
    seen.add(record.url);
    pages.push({
      url: record.url,
      title: typeof record.title === 'string' ? record.title : '',
      text: record.text.slice(0, MAX_RESULT_TEXT_CHARS),
    });
  }
  return pages;
}

/** The text with the key swapped out and cut short, safe to put in a report. */
export function scrubKey(text: string, key: string): string {
  let out = String(text ?? '');
  const secret = key.trim();
  if (secret) out = out.split(secret).join('[key]');
  return out.slice(0, MAX_DETAIL_CHARS);
}

export type SearchOutcome =
  | { ok: true; pages: FetchedPage[] }
  | { ok: false; reason: 'rate_limited'; retryAfterSeconds: number | null }
  | { ok: false; reason: 'timeout' | 'unauthorized' | 'unavailable' | 'bad_response'; detail?: string }
  | { ok: false; reason: 'no_key' | 'no_query' };

export type SearchExaOptions = {
  apiKey: string;
  query: string;
  numResults?: number;
  timeoutMs?: number;
  /** For tests and the local fake. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** For the local fake. Defaults to the vendor's address. */
  url?: string;
};

function readRetryAfter(response: Response): number | null {
  const raw = response.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, 3600) : null;
}

export async function searchExa(options: SearchExaOptions): Promise<SearchOutcome> {
  const key = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  if (!key) return { ok: false, reason: 'no_key' };
  const query = typeof options.query === 'string' ? options.query.trim() : '';
  if (!query) return { ok: false, reason: 'no_query' };

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_SEARCH_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(options.url ?? EXA_SEARCH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [EXA_KEY_HEADER]: key },
      body: JSON.stringify(buildSearchBody(query, { numResults: options.numResults })),
      signal: controller.signal,
    });

    if (response.status === 429) return { ok: false, reason: 'rate_limited', retryAfterSeconds: readRetryAfter(response) };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: 'unauthorized', detail: scrubKey(await safeText(response), key) };
    }
    if (!response.ok) {
      return { ok: false, reason: 'unavailable', detail: scrubKey(`status ${response.status}: ${await safeText(response)}`, key) };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, reason: 'bad_response', detail: 'The reply was not JSON.' };
    }
    if (!body || typeof body !== 'object' || !Array.isArray((body as { results?: unknown }).results)) {
      return { ok: false, reason: 'bad_response', detail: 'The reply had no results list.' };
    }
    return { ok: true, pages: normalizeExaResponse(body) };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'unavailable', detail: scrubKey(error instanceof Error ? error.message : 'request failed', key) };
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
