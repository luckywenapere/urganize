import { describe, expect, it } from 'vitest';
import { createModelExtractor } from './extractor';
import type { ExtractionRequest } from './extract';

// The extractor is the one place a model reads a page. It hands the model a request
// with no tools (built by `buildExtractionRequest`), reads the reply strictly, and
// never throws: a model that fails, times out or talks nonsense is a failed read of
// ONE page, never a crashed search.

const page = { url: 'https://fund.example.org/call', title: 'Fund', text: 'Fund\nApplications close on 30 November 2026.' };

describe('createModelExtractor', () => {
  it('passes the no-tools request to the model and returns its parsed fields', async () => {
    const seen: ExtractionRequest[] = [];
    const extract = createModelExtractor(async (request) => {
      seen.push(request);
      return JSON.stringify({ isGrant: true, title: 'Fund', funder: null, deadline: '2026-11-30', lastClosedOn: null, amount: null, currency: null, eligibility: [] });
    });
    const result = await extract(page);
    expect(result).toEqual({
      ok: true,
      fields: { isGrant: true, title: 'Fund', funder: null, deadline: '2026-11-30', lastClosedOn: null, amount: null, currency: null, eligibility: [] },
    });
    expect(seen).toHaveLength(1);
    expect(Object.keys(seen[0]).sort()).toEqual(['jsonSchema', 'system', 'user']);
    expect(seen[0].user).toContain('Applications close on 30 November 2026.');
  });

  it('reports a reply that is not JSON as a failed read, not a grant', async () => {
    const extract = createModelExtractor(async () => 'Sure! This looks like a great grant.');
    expect(await extract(page)).toEqual({ ok: false, reason: 'not_json' });
  });

  it('reports a reply with no isGrant verdict as a failed read', async () => {
    const extract = createModelExtractor(async () => '{"title":"Fund"}');
    expect(await extract(page)).toEqual({ ok: false, reason: 'no_verdict' });
  });

  it('turns a model that throws into a failed read and keeps the message out', async () => {
    const extract = createModelExtractor(async () => {
      throw new Error('upstream said sk_live_SECRET was rejected');
    });
    const result = await extract(page);
    expect(result).toEqual({ ok: false, reason: 'model_failed' });
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('gives up on a model that never answers, after the timeout', async () => {
    const extract = createModelExtractor(() => new Promise<string>(() => undefined), { timeoutMs: 20 });
    expect(await extract(page)).toEqual({ ok: false, reason: 'timeout' });
  });

  it('treats a non-string reply as not JSON', async () => {
    const extract = createModelExtractor(async () => undefined as unknown as string);
    expect(await extract(page)).toEqual({ ok: false, reason: 'not_json' });
  });
});
