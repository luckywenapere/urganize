import { describe, expect, it } from 'vitest';
import type { GrantProfileRow } from './grant-profile';
import { teamWeekdaySlot, type GrantProgramme } from './programmes';
import { runGrantSuggestionsWith, type GrantRunStore } from './weekly-run-core';

const NOW = new Date('2026-10-11T08:00:00Z'); // Sunday in Lagos, weekday 0

function idInSlot(slot: number, salt = ''): string {
  for (let i = 0; i < 10_000; i += 1) {
    const id = `ws-${salt}${i}`;
    if (teamWeekdaySlot(id) === slot) return id;
  }
  throw new Error('no id');
}

function programme(slug: string, over: Partial<GrantProgramme> = {}): GrantProgramme {
  return {
    slug,
    funder: 'Funder',
    programme: slug,
    url: 'https://f.example',
    kind: 'grant',
    countries: ['NG'],
    applicantTypes: ['individual'],
    needs: [],
    genres: [],
    stages: [],
    amountMin: null,
    amountMax: null,
    currency: null,
    status: 'open',
    opensOn: null,
    deadlineOn: '2026-12-01',
    lastClosedOn: null,
    recurring: false,
    summary: '',
    eligibility: '',
    sourceUrl: 'https://f.example',
    checkedOn: '2026-10-11',
    active: true,
    ...over,
  };
}

const NIGERIA: GrantProfileRow = { country: 'nigeria', stage: null, applicant_types: ['individual'], genres: [], needs: [] };

function store(over: Partial<GrantRunStore> & { profiles?: Array<{ workspaceId: string; row: GrantProfileRow }> } = {}) {
  const inserted: Array<{ workspaceId: string; programmeId: string; why: string }> = [];
  const calls = { access: [] as string[] };
  const pushes: Array<{ workspaceId: string; count: number }> = [];
  const s: GrantRunStore = {
    loadProgrammes: async () => [
      { id: 'p1', programme: programme('one') },
      { id: 'p2', programme: programme('two') },
      { id: 'p3', programme: programme('three') },
      { id: 'p4', programme: programme('four') },
      { id: 'p5', programme: programme('ghana-only', { countries: ['GH'] }) },
    ],
    loadProfiles: async () => over.profiles ?? [],
    loadHistory: async () => ({ programmeIds: new Set(), lastSuggestedAt: null }),
    resolveAccessState: async (id) => {
      calls.access.push(id);
      return 'paid';
    },
    insertSuggestions: async (rows) => {
      inserted.push(...rows);
      return rows.length;
    },
    queueTeamPush: async (workspaceId, count) => {
      pushes.push({ workspaceId, count });
      return 2;
    },
    ...over,
  };
  return { s, inserted, calls, pushes };
}

describe('runGrantSuggestionsWith', () => {
  it('queues one push per team that got suggestions, with the count', async () => {
    const team = idInSlot(0);
    const { s, pushes } = store({ profiles: [{ workspaceId: team, row: NIGERIA }] });
    const result = await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(pushes).toEqual([{ workspaceId: team, count: 3 }]);
    expect(result.pushesQueued).toBe(2);
  });

  it('sends no push when nothing was suggested', async () => {
    const { s, pushes } = store({ profiles: [{ workspaceId: idInSlot(0), row: { ...NIGERIA, country: 'kenya' } }] });
    await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(pushes).toEqual([]);
  });

  it('keeps the suggestions when the push fails', async () => {
    const { s, inserted } = store({
      profiles: [{ workspaceId: idInSlot(0), row: NIGERIA }],
      queueTeamPush: async () => {
        throw new Error('boom');
      },
    });
    const result = await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(inserted.length).toBe(3);
    expect(result.suggestions).toBe(3);
    expect(result.skipped.failed).toBe(0);
  });

  it('suggests up to three programmes to a paying team whose slot is today, with the right ids', async () => {
    const team = idInSlot(0);
    const { s, inserted } = store({ profiles: [{ workspaceId: team, row: NIGERIA }] });
    const result = await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(result.today).toBe('2026-10-11');
    expect(result.teamsDue).toBe(1);
    expect(result.suggestions).toBe(3);
    expect(inserted.map((row) => row.programmeId)).toEqual(['p4', 'p1', 'p3']);
    expect(inserted.every((row) => row.workspaceId === team && row.why === 'Open in Nigeria')).toBe(true);
  });

  it('leaves teams whose slot is another day alone', async () => {
    const { s, inserted, calls } = store({ profiles: [{ workspaceId: idInSlot(3), row: NIGERIA }] });
    const result = await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(result.teamsDue).toBe(0);
    expect(inserted).toEqual([]);
    expect(calls.access).toEqual([]);
  });

  it('gives nothing to a team that is not paying, or whose plan cannot be read', async () => {
    const a = idInSlot(0, 'a');
    const b = idInSlot(0, 'b');
    const { s, inserted } = store({
      profiles: [
        { workspaceId: a, row: NIGERIA },
        { workspaceId: b, row: NIGERIA },
      ],
      resolveAccessState: async (id) => (id === a ? 'trial' : null),
    });
    const result = await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(inserted).toEqual([]);
    expect(result.skipped.notPaying).toBe(2);
  });

  it('skips a profile with no country without asking about the plan', async () => {
    const { s, calls } = store({ profiles: [{ workspaceId: idInSlot(0), row: { ...NIGERIA, country: null } }] });
    await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(calls.access).toEqual([]);
  });

  it('never repeats a programme the team was shown, added or dismissed', async () => {
    const { s, inserted } = store({
      profiles: [{ workspaceId: idInSlot(0), row: NIGERIA }],
      loadHistory: async () => ({ programmeIds: new Set(['p1', 'p2', 'p3']), lastSuggestedAt: '2026-09-01T08:00:00Z' }),
    });
    await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(inserted.map((row) => row.programmeId)).toEqual(['p4']);
  });

  it('gives a team nothing more inside six days of its last batch, so a rerun is safe', async () => {
    const { s, inserted } = store({
      profiles: [{ workspaceId: idInSlot(0), row: NIGERIA }],
      loadHistory: async () => ({ programmeIds: new Set(['p1']), lastSuggestedAt: '2026-10-11T07:00:00Z' }),
    });
    const result = await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(inserted).toEqual([]);
    expect(result.skipped.recent).toBe(1);
  });

  it('counts a team with no match and writes nothing', async () => {
    const { s, inserted } = store({ profiles: [{ workspaceId: idInSlot(0), row: { ...NIGERIA, country: 'kenya' } }] });
    const result = await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(inserted).toEqual([]);
    expect(result.skipped.noMatch).toBe(1);
  });

  it('one failing team does not stop the next', async () => {
    const a = idInSlot(0, 'a');
    const b = idInSlot(0, 'b');
    const { s, inserted } = store({
      profiles: [
        { workspaceId: a, row: NIGERIA },
        { workspaceId: b, row: NIGERIA },
      ],
      loadHistory: async (id) => {
        if (id === a) throw new Error('boom');
        return { programmeIds: new Set(), lastSuggestedAt: null };
      },
    });
    const result = await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(result.skipped.failed).toBe(1);
    expect(new Set(inserted.map((row) => row.workspaceId))).toEqual(new Set([b]));
  });

  it('stops starting teams when the budget runs out and says how many were left', async () => {
    const teams = [idInSlot(0, 'a'), idInSlot(0, 'b'), idInSlot(0, 'c')];
    let t = 0;
    const { s, inserted } = store({ profiles: teams.map((workspaceId) => ({ workspaceId, row: NIGERIA })) });
    const result = await runGrantSuggestionsWith(s, {
      now: NOW,
      timeBudgetMs: 100,
      clock: () => {
        t += 60;
        return t;
      },
    });
    expect(result.skipped.outOfTime).toBeGreaterThan(0);
    expect(result.teamsSuggested + result.skipped.outOfTime).toBe(3);
    expect(inserted.length).toBe(result.suggestions);
  });

  it('respects the per-call team ceiling', async () => {
    const teams = [idInSlot(0, 'a'), idInSlot(0, 'b'), idInSlot(0, 'c')];
    const { s, calls } = store({ profiles: teams.map((workspaceId) => ({ workspaceId, row: NIGERIA })) });
    const result = await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000, maxTeams: 2 });
    expect(result.teamsDue).toBe(2);
    expect(calls.access.length).toBe(2);
  });

  it('does not load programmes when no team is due', async () => {
    let loaded = false;
    const { s } = store({
      profiles: [],
      loadProgrammes: async () => {
        loaded = true;
        return [];
      },
    });
    await runGrantSuggestionsWith(s, { now: NOW, timeBudgetMs: 5000 });
    expect(loaded).toBe(false);
  });
});
