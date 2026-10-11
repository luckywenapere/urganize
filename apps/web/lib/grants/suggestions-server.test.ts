import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/opportunities-server', () => ({ createOpportunity: vi.fn() }));
import { createOpportunity } from '@/lib/opportunities-server';
import { actOnGrantSuggestion, listGrantSuggestions } from './suggestions-server';
import type { GrantProgrammeRow } from './weekly-run';

// A chainable stand-in for the Supabase query builder. Every call is recorded;
// each awaited query takes the next queued result for its table.
type Call = { table: string; ops: Array<[string, unknown[]]> };
function fakeClient(results: Record<string, Array<{ data?: unknown; error?: unknown }>>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'update', 'insert', 'upsert', 'eq', 'not', 'order', 'limit']) {
      builder[op] = (...args: unknown[]) => {
        call.ops.push([op, args]);
        return builder;
      };
    }
    const settle = () => Promise.resolve((results[table] ?? []).shift() ?? { data: null, error: null });
    builder.maybeSingle = () => settle();
    builder.single = () => settle();
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => settle().then(resolve, reject);
    return builder;
  };
  return { client: { from } as unknown as SupabaseClient, calls };
}

const programmeRow: GrantProgrammeRow = {
  id: 'p1',
  slug: 'kekere',
  funder: 'Africa No Filter',
  programme: 'Kekere Storytellers Fund',
  url: 'https://anf.example',
  kind: 'grant',
  countries: ['AFRICA'],
  applicant_types: ['individual'],
  needs: [],
  genres: [],
  stages: [],
  amount_min: null,
  amount_max: '5000',
  currency: 'USD',
  status: 'open',
  opens_on: null,
  deadline_on: '2026-11-30',
  last_closed_on: null,
  recurring: true,
  summary: 'Small grants.',
  eligibility: '',
  source_url: 'https://anf.example/kekere',
  checked_on: '2026-10-11',
  active: true,
};

const base = { workspaceId: 'ws-1', actorUserId: 'u-1', suggestionId: 's-1' };

describe('actOnGrantSuggestion', () => {
  beforeEach(() => vi.mocked(createOpportunity).mockReset());

  it('dismiss claims only a new row on this team and creates nothing', async () => {
    const { client, calls } = fakeClient({ grant_suggestions: [{ data: { id: 's-1', grant_programmes: programmeRow } }] });
    const result = await actOnGrantSuggestion(client, { ...base, action: 'dismiss' });
    expect(result).toEqual({ ok: true, opportunity: null });
    const ops = calls[0].ops;
    expect(ops[0][0]).toBe('update');
    expect((ops[0][1][0] as { state: string }).state).toBe('dismissed');
    expect(ops).toContainEqual(['eq', ['workspace_id', 'ws-1']]);
    expect(ops).toContainEqual(['eq', ['state', 'new']]);
    expect(createOpportunity).not.toHaveBeenCalled();
  });

  it('answers 404 when the row was already handled, and creates nothing', async () => {
    const { client } = fakeClient({ grant_suggestions: [{ data: null }] });
    const result = await actOnGrantSuggestion(client, { ...base, action: 'add' });
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(createOpportunity).not.toHaveBeenCalled();
  });

  it('add creates a grant opportunity, records its source and links the suggestion', async () => {
    vi.mocked(createOpportunity).mockResolvedValueOnce({ ok: true, opportunity: { id: 'o-1' } as never });
    const { client, calls } = fakeClient({ grant_suggestions: [{ data: { id: 's-1', grant_programmes: programmeRow } }] });
    const result = await actOnGrantSuggestion(client, { ...base, action: 'add' });
    expect(result).toMatchObject({ ok: true, opportunity: { id: 'o-1' } });
    const data = vi.mocked(createOpportunity).mock.calls[0][1].data;
    expect(data).toMatchObject({ kind: 'grant', status: 'idea', title: 'Kekere Storytellers Fund', amount: 5000 });
    const source = calls.find((c) => c.table === 'opportunities');
    expect(source?.ops[0]).toEqual(['update', [{ source_url: 'https://anf.example/kekere', source_read_on: '2026-10-11' }]]);
    const link = calls.filter((c) => c.table === 'grant_suggestions')[1];
    expect(link.ops[0]).toEqual(['update', [{ opportunity_id: 'o-1' }]]);
  });

  it('puts the suggestion back to new when the opportunity could not be created', async () => {
    vi.mocked(createOpportunity).mockResolvedValueOnce({ ok: false, error: 'nope', status: 500 });
    const { client, calls } = fakeClient({ grant_suggestions: [{ data: { id: 's-1', grant_programmes: programmeRow } }] });
    const result = await actOnGrantSuggestion(client, { ...base, action: 'add' });
    expect(result).toMatchObject({ ok: false, status: 500 });
    const back = calls.filter((c) => c.table === 'grant_suggestions')[1];
    expect(back.ops[0]).toEqual(['update', [{ state: 'new', acted_by: null, acted_at: null }]]);
  });
});

describe('listGrantSuggestions', () => {
  it('shows new rows only, and hides closed, switched-off or past-deadline programmes', async () => {
    const { client, calls } = fakeClient({
      grant_suggestions: [
        {
          data: [
            { id: 'a', why: 'Open across Africa', suggested_at: '2026-10-11T08:00:00Z', state: 'new', grant_programmes: programmeRow },
            { id: 'b', why: '', suggested_at: '', state: 'new', grant_programmes: { ...programmeRow, status: 'closed' } },
            { id: 'c', why: '', suggested_at: '', state: 'new', grant_programmes: { ...programmeRow, active: false } },
            { id: 'd', why: '', suggested_at: '', state: 'new', grant_programmes: { ...programmeRow, deadline_on: '2026-10-10' } },
            { id: 'e', why: '', suggested_at: '', state: 'new', grant_programmes: null },
          ],
        },
      ],
    });
    const result = await listGrantSuggestions(client, 'ws-1', new Date('2026-10-11T08:00:00Z'));
    expect(result.ok && result.suggestions.map((s) => s.id)).toEqual(['a']);
    expect(result.ok && result.suggestions[0].award).toBe('Up to $5,000');
    expect(calls[0].ops).toContainEqual(['eq', ['state', 'new']]);
    expect(calls[0].ops).toContainEqual(['eq', ['workspace_id', 'ws-1']]);
  });
});
