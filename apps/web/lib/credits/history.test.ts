import { describe, expect, it } from 'vitest';
import { buildHistory, formatSignedCredits, type LedgerHistoryRow } from './history';

let n = 0;
function row(over: Partial<LedgerHistoryRow> & { kind: string; credits: number }): LedgerHistoryRow {
  n += 1;
  return {
    id: `row-${n}`,
    pool: 'allowance',
    dedupe_key: null,
    metadata: null,
    created_at: `2026-10-0${Math.min(n, 9)}T10:00:00.000Z`,
    ...over,
  };
}

describe('buildHistory', () => {
  it('names every kind of movement in plain words', () => {
    const entries = buildHistory([
      row({ kind: 'trial', credits: 50 }),
      row({ kind: 'allowance', credits: 660 }),
      row({ kind: 'topup', pool: 'topup', credits: 100 }),
      row({ kind: 'refund', credits: 3 }),
      row({ kind: 'expire', pool: 'trial', credits: -12 }),
      row({ kind: 'spend', credits: -6 }),
    ]);
    expect(entries.map((e) => e.label).sort()).toEqual(
      [
        'Credits refunded',
        'Credits you bought',
        'Monthly credits',
        'Trial credits',
        'Trial credits ended',
        'UrgAns chat',
      ].sort()
    );
  });

  it('puts the newest first', () => {
    const entries = buildHistory([
      row({ kind: 'trial', credits: 50, created_at: '2026-10-01T00:00:00Z' }),
      row({ kind: 'spend', credits: -2, created_at: '2026-10-03T00:00:00Z' }),
      row({ kind: 'allowance', credits: 150, created_at: '2026-10-02T00:00:00Z' }),
    ]);
    expect(entries.map((e) => e.label)).toEqual(['UrgAns chat', 'Monthly credits', 'Trial credits']);
  });

  it('folds the rows of one turn into a single line that adds up', () => {
    const entries = buildHistory([
      row({ kind: 'spend', pool: 'trial', credits: -4, dedupe_key: 'spend:req-1:trial' }),
      row({ kind: 'spend', pool: 'allowance', credits: -2, dedupe_key: 'spend:req-1:allowance' }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].credits).toBe(-6);
  });

  it('keeps two different turns apart', () => {
    const entries = buildHistory([
      row({ kind: 'spend', credits: -4, dedupe_key: 'spend:req-1:allowance' }),
      row({ kind: 'spend', credits: -2, dedupe_key: 'spend:req-2:allowance' }),
    ]);
    expect(entries).toHaveLength(2);
  });

  it('names an embedded action by what it did, and an unknown one plainly', () => {
    const entries = buildHistory([
      row({ kind: 'spend', credits: -12, metadata: { source: 'embedded_action', action: 'release.draft_plan' } }),
      row({ kind: 'spend', credits: -9, metadata: { source: 'embedded_action', action: 'release.fill_pitch' } }),
      row({ kind: 'spend', credits: -7, metadata: { source: 'embedded_action', action: 'something.new' } }),
    ]);
    expect(entries.map((e) => e.label).sort()).toEqual(
      ['Built a rollout plan', 'Filled a pitch kit', 'UrgAns did some work'].sort()
    );
  });

  it('says who made an adjustment and keeps the note', () => {
    const [added, taken] = buildHistory([
      row({ kind: 'adjust', pool: 'topup', credits: 200, metadata: { source: 'admin', note: 'Goodwill' }, created_at: '2026-10-05T00:00:00Z' }),
      row({ kind: 'adjust', pool: 'topup', credits: -50, created_at: '2026-10-04T00:00:00Z' }),
    ]);
    expect(added).toMatchObject({ label: 'Credits added by Urganize', detail: 'Goodwill' });
    expect(taken).toMatchObject({ label: 'Credits taken off by Urganize', detail: '' });
  });

  it('drops a movement of nothing, and never shows provider cost or models', () => {
    const entries = buildHistory([
      row({ kind: 'spend', credits: 0 }),
      row({
        kind: 'spend',
        credits: -3,
        metadata: { models: ['openai/gpt-5.4'], tokens_in: 900, charge_credits: 3 },
      }),
    ]);
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toMatch(/gpt|tokens|rodi/i);
  });
});

describe('formatSignedCredits', () => {
  it('signs the amount', () => {
    expect(formatSignedCredits(100)).toBe('+100');
    expect(formatSignedCredits(-6)).toBe('-6');
    expect(formatSignedCredits(0)).toBe('0');
    expect(formatSignedCredits(1500)).toBe('+1,500');
  });
});

describe('a voice call in the history (2026-10-11)', () => {
  const voiceRow = (minute: number, credits: number, at: string) => ({
    id: `v${minute}`,
    kind: 'spend',
    pool: 'allowance',
    credits,
    dedupe_key: `spend:voice:call-1:m${minute}:allowance`,
    created_at: at,
    metadata: { reason: 'voice_minute', voice_session_id: 'call-1' },
  });

  it('shows the whole call as one line, summing its minutes', async () => {
    const { buildHistory } = await import('./history');
    const entries = buildHistory([
      voiceRow(1, -2, '2026-10-11T10:00:00Z'),
      voiceRow(2, -2, '2026-10-11T10:01:00Z'),
      voiceRow(3, -2, '2026-10-11T10:02:00Z'),
    ] as never);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ label: 'Voice call with UrgAns', credits: -6 });
  });
});
