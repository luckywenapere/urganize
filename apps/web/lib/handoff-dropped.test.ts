import { describe, expect, it } from 'vitest';
import {
  EMPTY_ITEM_RECORD,
  activeCount,
  deriveHandoffStatus,
  handoffChipSummary,
  handoffHeader,
  isRowLate,
  planHandoffTaskSync,
  rowActionFor,
  sentCount,
  type HandoffStatus,
} from './handoff';

// URG-399 follow-up (Oyin, Oct 19, 2026): a cancelled send task means that
// send was DROPPED. It is neither sent nor owed.

const approved = { ...EMPTY_ITEM_RECORD, approvedAt: '2026-10-15T10:00:00Z', approvedBy: 'u1', approvedFor: 'asset-1' };
const day = (ymd: string) => `D ${ymd}`;

describe('a cancelled send task is dropped', () => {
  it('reads dropped whatever state the file is in', () => {
    expect(deriveHandoffStatus({ uploaded: true, record: approved, fingerprint: 'asset-1', task: { status: 'cancelled' } })).toBe(
      'dropped'
    );
    expect(
      deriveHandoffStatus({ uploaded: false, record: EMPTY_ITEM_RECORD, fingerprint: null, task: { status: 'cancelled' } })
    ).toBe('dropped');
    // A record that says sent before there was a task does not beat the cancel.
    expect(
      deriveHandoffStatus({ uploaded: true, record: approved, fingerprint: 'asset-1', task: { status: 'cancelled' }, sentWithoutTask: true })
    ).toBe('dropped');
  });

  it('leaves the other statuses exactly as before', () => {
    expect(deriveHandoffStatus({ uploaded: true, record: approved, fingerprint: 'asset-1', task: { status: 'done' } })).toBe('sent');
    expect(deriveHandoffStatus({ uploaded: true, record: approved, fingerprint: 'asset-1', task: { status: 'todo' } })).toBe('approved');
    expect(deriveHandoffStatus({ uploaded: false, record: approved, fingerprint: 'asset-1', task: { status: 'todo' } })).toBe('missing');
    expect(deriveHandoffStatus({ uploaded: true, record: approved, fingerprint: 'asset-1', task: { status: 'in_progress' } })).toBe(
      'approved'
    );
  });

  it('offers no action', () => {
    expect(rowActionFor('dropped')).toBeNull();
  });

  it('is never late', () => {
    expect(isRowLate('dropped', '2026-10-10', '2026-10-19')).toBe(false);
    expect(isRowLate('missing', '2026-10-10', '2026-10-19')).toBe(true);
    expect(isRowLate('sent', '2026-10-10', '2026-10-19')).toBe(false);
    expect(isRowLate('missing', '2026-10-19', '2026-10-19')).toBe(false);
    expect(isRowLate('missing', null, '2026-10-19')).toBe(false);
  });

  it('a cancelled task is not reopened or touched by the sync, except its date following the release', () => {
    const ops = planHandoffTaskSync({
      dueDate: '2026-10-10',
      items: [
        {
          item: 'cover_art',
          uploaded: false,
          ownerUserId: 'u1',
          task: { id: 't1', status: 'cancelled', assignedToUserId: 'u1', dueDate: '2026-10-10T00:00:00.000Z', completedAt: null },
        },
      ],
    });
    expect(ops).toEqual([]);
  });
});

describe('the counts leave dropped sends out', () => {
  it('N of M sent', () => {
    const statuses: HandoffStatus[] = ['dropped', 'missing'];
    expect(sentCount(statuses)).toBe(0);
    expect(activeCount(statuses)).toBe(1);
    expect(activeCount(['dropped', 'dropped'])).toBe(0);
    expect(activeCount(['sent', 'uploaded'])).toBe(2);
  });

  it('the header ignores dropped rows', () => {
    expect(handoffHeader({ dueDate: '2026-10-10', today: '2026-10-19', statuses: ['dropped', 'sent'], sentDates: [null, '2026-10-09T09:00:00Z'] })).toEqual({
      kind: 'all_sent',
      sentOn: '2026-10-09',
    });
    expect(handoffHeader({ dueDate: '2026-10-10', today: '2026-10-19', statuses: ['dropped', 'missing'], sentDates: [] })).toEqual({
      kind: 'late',
      days: 9,
      dueDate: '2026-10-10',
    });
    expect(handoffHeader({ dueDate: '2026-10-10', today: '2026-10-19', statuses: ['dropped', 'dropped'], sentDates: [] })).toEqual({
      kind: 'all_dropped',
    });
    // Every row dropped beats "pick a release date".
    expect(handoffHeader({ dueDate: null, today: '2026-10-19', statuses: ['dropped', 'dropped'], sentDates: [] })).toEqual({
      kind: 'all_dropped',
    });
  });
});

describe('the rollout line chip', () => {
  it('none dropped: unchanged', () => {
    expect(handoffChipSummary(['missing', 'missing'], '2026-10-10', '2026-10-19', day)).toEqual({
      sent: 0,
      total: 2,
      allSent: false,
      late: 9,
      summary: '0 of 2 sent · 9 days late',
    });
    expect(handoffChipSummary(['missing', 'sent'], '2026-10-30', '2026-10-19', day)?.summary).toBe('1 of 2 sent · due D 2026-10-30');
    expect(handoffChipSummary(['sent', 'sent'], '2026-10-10', '2026-10-19', day)).toMatchObject({ allSent: true, late: 0, summary: '2 of 2 sent' });
  });

  it('one dropped: out of both numbers', () => {
    expect(handoffChipSummary(['dropped', 'missing'], '2026-10-10', '2026-10-19', day)?.summary).toBe('0 of 1 sent · 9 days late');
    // The other one was sent: all sent, nothing late.
    expect(handoffChipSummary(['dropped', 'sent'], '2026-10-10', '2026-10-19', day)).toMatchObject({
      sent: 1,
      total: 1,
      allSent: true,
      late: 0,
      summary: '1 of 1 sent',
    });
  });

  it('every send dropped: no chip, never "0 of 0"', () => {
    expect(handoffChipSummary(['dropped', 'dropped'], '2026-10-10', '2026-10-19', day)).toBeNull();
    expect(handoffChipSummary([], '2026-10-10', '2026-10-19', day)).toBeNull();
  });
});
