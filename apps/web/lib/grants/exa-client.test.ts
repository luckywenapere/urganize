import { describe, expect, it } from 'vitest';
import { buildSearchBody, EXA_SEARCH_URL, MAX_RESULT_TEXT_CHARS, normalizeExaResponse, scrubKey, searchExa } from './exa-client';

const KEY = 'exa-test-key-0123456789abcdef';

type FetchArgs = { url: string; init: RequestInit };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

function fakeFetch(respond: (args: FetchArgs) => Response | Promise<Response>, seen: FetchArgs[] = []) {
  const impl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const args = { url: String(url), init: init ?? {} };
    seen.push(args);
    return respond(args);
  };
  return { impl: impl as unknown as typeof fetch, seen };
}

describe('buildSearchBody', () => {
  it('carries the query, a result count and a text cap, and nothing about the user', () => {
    const body = buildSearchBody('music grants in Nigeria for afrobeats artists 2027', { numResults: 8 });
    expect(body.query).toBe('music grants in Nigeria for afrobeats artists 2027');
    expect(body.numResults).toBe(8);
    expect(JSON.stringify(body)).toContain('maxCharacters');
  });

  it('keeps the result count inside a sane range', () => {
    expect(buildSearchBody('q', { numResults: 500 }).numResults).toBeLessThanOrEqual(25);
    expect(buildSearchBody('q', { numResults: 0 }).numResults).toBeGreaterThanOrEqual(1);
    expect(typeof buildSearchBody('q').numResults).toBe('number');
  });
});

describe('normalizeExaResponse', () => {
  it('turns results into pages', () => {
    const pages = normalizeExaResponse({ results: [{ url: 'https://example.org/fund', title: 'Fund', text: 'Apply now' }] });
    expect(pages).toEqual([{ url: 'https://example.org/fund', title: 'Fund', text: 'Apply now' }]);
  });

  it('drops results with no usable link or no text', () => {
    const pages = normalizeExaResponse({
      results: [
        { url: 'not a url', title: 'a', text: 'x' },
        { url: 'ftp://example.org/x', title: 'b', text: 'x' },
        { url: 'https://example.org/none', title: 'c' },
        { url: 'https://example.org/empty', title: 'd', text: '   ' },
        { url: 'https://example.org/ok', title: 'e', text: 'fine' },
      ],
    });
    expect(pages.map((page) => page.url)).toEqual(['https://example.org/ok']);
  });

  it('keeps the first of two results with the same link', () => {
    const pages = normalizeExaResponse({
      results: [
        { url: 'https://example.org/a', title: 'first', text: 'one' },
        { url: 'https://example.org/a', title: 'second', text: 'two' },
      ],
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('first');
  });

  it('cuts very long text', () => {
    const pages = normalizeExaResponse({ results: [{ url: 'https://example.org/a', title: 't', text: 'x'.repeat(MAX_RESULT_TEXT_CHARS + 5000) }] });
    expect(pages[0].text.length).toBe(MAX_RESULT_TEXT_CHARS);
  });

  it('gives an empty title when none was sent', () => {
    expect(normalizeExaResponse({ results: [{ url: 'https://example.org/a', text: 'x' }] })[0].title).toBe('');
  });

  it('returns nothing for a body that is not the expected shape', () => {
    for (const bad of [null, undefined, 5, 'text', [], {}, { results: 'x' }, { results: null }]) {
      expect(normalizeExaResponse(bad)).toEqual([]);
    }
  });
});

describe('scrubKey', () => {
  it('removes the key wherever it appears, and cuts the text', () => {
    const out = scrubKey(`bad key ${KEY} and again ${KEY}`, KEY);
    expect(out).not.toContain(KEY);
    expect(out).toContain('[key]');
    expect(scrubKey('x'.repeat(1000), KEY).length).toBeLessThanOrEqual(200);
  });

  it('does nothing odd when there is no key', () => {
    expect(scrubKey('plain', '')).toBe('plain');
  });
});

describe('searchExa', () => {
  it('sends the key in a header, the body as JSON, and returns the pages', async () => {
    const { impl, seen } = fakeFetch(() => jsonResponse({ results: [{ url: 'https://example.org/a', title: 'A', text: 'hello' }] }));
    const outcome = await searchExa({ apiKey: KEY, query: 'music grants Nigeria', fetchImpl: impl });
    expect(outcome).toMatchObject({ ok: true });
    if (outcome.ok) expect(outcome.pages).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(EXA_SEARCH_URL);
    expect(seen[0].init.method).toBe('POST');
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(KEY);
    expect(JSON.parse(String(seen[0].init.body)).query).toBe('music grants Nigeria');
    expect(seen[0].url).not.toContain(KEY);
    expect(String(seen[0].init.body)).not.toContain(KEY);
  });

  it('refuses to call out with no key and never touches the network', async () => {
    const { impl, seen } = fakeFetch(() => jsonResponse({}));
    expect(await searchExa({ apiKey: '', query: 'q', fetchImpl: impl })).toEqual({ ok: false, reason: 'no_key' });
    expect(await searchExa({ apiKey: '   ', query: 'q', fetchImpl: impl })).toEqual({ ok: false, reason: 'no_key' });
    expect(seen).toHaveLength(0);
  });

  it('refuses an empty query', async () => {
    const { impl, seen } = fakeFetch(() => jsonResponse({}));
    const outcome = await searchExa({ apiKey: KEY, query: '  ', fetchImpl: impl });
    expect(outcome.ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it('reads a 429 as rate limited and passes on how long to wait', async () => {
    const { impl } = fakeFetch(() => new Response('slow down', { status: 429, headers: { 'retry-after': '12' } }));
    expect(await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl })).toEqual({ ok: false, reason: 'rate_limited', retryAfterSeconds: 12 });
  });

  it('reads a 429 with no usable Retry-After as rate limited with no wait', async () => {
    const { impl } = fakeFetch(() => new Response('slow down', { status: 429, headers: { 'retry-after': 'soon' } }));
    expect(await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl })).toEqual({ ok: false, reason: 'rate_limited', retryAfterSeconds: null });
  });

  it('does not try again on its own after a 429', async () => {
    const { impl, seen } = fakeFetch(() => new Response('slow down', { status: 429 }));
    await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl });
    expect(seen).toHaveLength(1);
  });

  it('reads 401 and 403 as unauthorized', async () => {
    for (const status of [401, 403]) {
      const { impl } = fakeFetch(() => new Response('no', { status }));
      expect(await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl })).toMatchObject({ ok: false, reason: 'unauthorized' });
    }
  });

  it('reads a 5xx as unavailable', async () => {
    const { impl } = fakeFetch(() => new Response('oops', { status: 503 }));
    expect(await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl })).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('reads any other failure status as unavailable too, never as an empty list', async () => {
    const { impl } = fakeFetch(() => new Response('teapot', { status: 418 }));
    const outcome = await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl });
    expect(outcome.ok).toBe(false);
  });

  it('reads a network failure as unavailable and does not throw', async () => {
    const { impl } = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    expect(await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl })).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('reads a 200 that is not JSON as a bad response', async () => {
    const { impl } = fakeFetch(() => new Response('<html>nope</html>', { status: 200 }));
    expect(await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl })).toMatchObject({ ok: false, reason: 'bad_response' });
  });

  it('reads a 200 with no results array as a bad response, not as no results', async () => {
    const { impl } = fakeFetch(() => jsonResponse({ hello: 'world' }));
    expect(await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl })).toMatchObject({ ok: false, reason: 'bad_response' });
  });

  it('reads a real empty list as ok with no pages', async () => {
    const { impl } = fakeFetch(() => jsonResponse({ results: [] }));
    expect(await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl })).toEqual({ ok: true, pages: [] });
  });

  it('gives up after the timeout and says so', async () => {
    const { impl } = fakeFetch(
      (args) =>
        new Promise<Response>((_resolve, reject) => {
          (args.init.signal as AbortSignal).addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const outcome = await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl, timeoutMs: 20 });
    expect(outcome).toMatchObject({ ok: false, reason: 'timeout' });
  });

  it('never lets the key out in an error detail, even when the server echoes it', async () => {
    const { impl } = fakeFetch(() => new Response(`invalid api key: ${KEY}`, { status: 401 }));
    const outcome = await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl });
    expect(JSON.stringify(outcome)).not.toContain(KEY);
  });

  it('never lets the key out when the network error message carries it', async () => {
    const { impl } = fakeFetch(() => {
      throw new Error(`connect failed for ${KEY}`);
    });
    const outcome = await searchExa({ apiKey: KEY, query: 'q', fetchImpl: impl });
    expect(JSON.stringify(outcome)).not.toContain(KEY);
  });
});
