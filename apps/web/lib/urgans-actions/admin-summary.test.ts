import { describe, expect, it } from 'vitest';
import {
  summarizeUrgansActions,
  type UrgansActionRow,
  type UrgansBillingSignalRow,
} from './admin-summary';

const action = (partial: Partial<UrgansActionRow>): UrgansActionRow => ({
  workspaceId: 'ws-1',
  actionType: 'release.draft_plan',
  status: 'drafted',
  tokensIn: null,
  tokensOut: null,
  createdAt: '2026-09-03T12:00:00.000Z',
  ...partial,
});

const signal = (partial: Partial<UrgansBillingSignalRow>): UrgansBillingSignalRow => ({
  workspaceId: 'ws-1',
  type: 'urgans_guard_tripped',
  createdAt: '2026-09-03T00:00:00.000Z',
  ...partial,
});

describe('summarizeUrgansActions', () => {
  it('buckets by team, month and action type', () => {
    const rows = summarizeUrgansActions(
      [action({ createdAt: '2026-09-03T00:00:00.000Z' }), action({ createdAt: '2026-08-15T00:00:00.000Z' })],
      []
    );
    expect(rows.map((row) => row.month).sort()).toEqual(['2026-08', '2026-09']);
  });

  it('counts each status independently, without one clobbering another', () => {
    const rows = summarizeUrgansActions(
      [
        action({ status: 'drafted' }),
        action({ status: 'drafted' }),
        action({ status: 'applied' }),
        action({ status: 'discarded' }),
        action({ status: 'failed' }),
      ],
      []
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ drafted: 2, applied: 1, discarded: 1, failed: 1 });
  });

  it('sums tokens, excluding nulls rather than treating them as zero', () => {
    const rows = summarizeUrgansActions(
      [
        action({ tokensIn: 100, tokensOut: 50 }),
        action({ tokensIn: null, tokensOut: null }),
        action({ tokensIn: 200, tokensOut: 75 }),
      ],
      []
    );
    expect(rows[0].tokensIn).toBe(300);
    expect(rows[0].tokensOut).toBe(125);
    // Only the two actions that reported a count are counted — not all three
    // drafted actions. Averaging tokensIn / drafted would understate the
    // true per-call cost by counting the unreported run in the denominator.
    expect(rows[0].tokensReportedCount).toBe(2);
    expect(rows[0].drafted).toBe(3);
  });

  it('a reported zero is real data, not absence', () => {
    const rows = summarizeUrgansActions([action({ tokensIn: 0, tokensOut: 0 })], []);
    expect(rows[0].tokensIn).toBe(0);
    expect(rows[0].tokensReportedCount).toBe(1);
  });

  it('a run reporting only one of the two token fields still counts as reported', () => {
    const rows = summarizeUrgansActions([action({ tokensIn: 42, tokensOut: null })], []);
    expect(rows[0].tokensIn).toBe(42);
    expect(rows[0].tokensOut).toBe(0);
    expect(rows[0].tokensReportedCount).toBe(1);
  });

  it('drops a row with no workspace or an unparseable date, rather than crashing', () => {
    const rows = summarizeUrgansActions(
      [action({ workspaceId: null }), action({ createdAt: 'not-a-date' })],
      []
    );
    expect(rows).toHaveLength(0);
  });

  it('billing signals land on a shared (all actions) bucket per team and month', () => {
    const rows = summarizeUrgansActions(
      [],
      [
        signal({ type: 'urgans_guard_tripped' }),
        signal({ type: 'upgrade_prompt_shown' }),
        signal({ type: 'upgrade_prompt_shown' }),
        signal({ type: 'upgrade_clicked' }),
      ]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actionType: '(all actions)',
      guardTrips: 1,
      upgradePromptsShown: 2,
      upgradeClicks: 1,
    });
  });

  it('signals and actions in the same team+month stay in separate rows, not merged', () => {
    const rows = summarizeUrgansActions(
      [action({ status: 'drafted' })],
      [signal({ type: 'urgans_guard_tripped' })]
    );
    expect(rows).toHaveLength(2);
    const actionRow = rows.find((row) => row.actionType === 'release.draft_plan');
    const signalRow = rows.find((row) => row.actionType === '(all actions)');
    expect(actionRow).toMatchObject({ drafted: 1, guardTrips: 0 });
    expect(signalRow).toMatchObject({ drafted: 0, guardTrips: 1 });
  });

  it('sorts newest month first, then by workspace, then by action type', () => {
    const rows = summarizeUrgansActions(
      [
        action({ workspaceId: 'ws-b', createdAt: '2026-08-01T00:00:00.000Z' }),
        action({ workspaceId: 'ws-a', createdAt: '2026-09-01T00:00:00.000Z' }),
        action({ workspaceId: 'ws-a', createdAt: '2026-08-01T00:00:00.000Z' }),
      ],
      []
    );
    expect(rows.map((row) => `${row.month}:${row.workspaceId}`)).toEqual([
      '2026-09:ws-a',
      '2026-08:ws-a',
      '2026-08:ws-b',
    ]);
  });

  it('two different teams in the same month never share a row', () => {
    const rows = summarizeUrgansActions(
      [action({ workspaceId: 'ws-a', status: 'drafted' }), action({ workspaceId: 'ws-b', status: 'applied' })],
      []
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.workspaceId === 'ws-a')).toMatchObject({ drafted: 1, applied: 0 });
    expect(rows.find((row) => row.workspaceId === 'ws-b')).toMatchObject({ drafted: 0, applied: 1 });
  });
});
