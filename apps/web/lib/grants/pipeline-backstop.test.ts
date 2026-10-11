import { describe, expect, it, vi } from 'vitest';

// The mapper is built to always give a draft the table accepts, and `map.test.ts`
// holds that. The pipeline still re-checks every draft with the real validator, so a
// future change to either side drops the draft instead of handing out one a person
// could not save. This file stands in for that future change.
vi.mock('../opportunities', async (original) => {
  const real = await original<typeof import('../opportunities')>();
  return { ...real, parseOpportunityCreate: () => ({ error: 'Pretend the table refused this.' }) };
});

import { runGrantSearch, type PipelineDeps } from './pipeline';
import type { SearchOutcome } from './exa-client';

const page = {
  url: 'https://fund1.example.org/call',
  title: 'Fund 1',
  text: 'Fund 1\nRun by Foundation 1.\nApplications close on 30 November 2026.\n',
};

describe('runGrantSearch: a draft the table would refuse', () => {
  it('is dropped with a reason, while the grant stays in its bucket', async () => {
    const built: PipelineDeps = {
      search: async () => ({ ok: true, pages: [page] }) as SearchOutcome,
      extract: async () => ({ ok: true, fields: { isGrant: true, title: 'Fund 1', funder: 'Foundation 1', deadline: '2026-11-30' } }),
    };
    const report = await runGrantSearch(built, { facts: { genre: 'afrobeats', country: 'nigeria' }, today: '2026-10-11', maxQueries: 1 });
    expect(report.open).toHaveLength(1);
    expect(report.drafts).toHaveLength(0);
    expect(report.dropped).toContainEqual({ url: page.url, reason: 'draft_invalid' });
  });
});
