import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HANDOFF_LEAD_DAYS,
  daysLate,
  deriveHandoffStatus,
  dueDateToTimestamp,
  EMPTY_ITEM_RECORD,
  fixFor,
  formatDaysLate,
  formatHandoffDay,
  handoffDueDate,
  handoffHeader,
  isUploaded,
  planHandoffTaskSync,
  readHandoffRecord,
  readLeadDays,
  rowActionFor,
  rowActionLabel,
  withItemRecord,
  canActOnItem,
} from './handoff';
import { checkDistributionFacts, type DistributionFacts } from './distribution-rules';
import { handoffTaskId } from './handoff-task-id';

const TODAY = new Date('2026-10-16T09:00:00Z');

const readyFacts: DistributionFacts = {
  title: 'Happy Day',
  primaryArtist: 'Solid the Creator',
  releaseDate: '2026-11-13',
  genre: 'Afrobeats',
  language: 'English',
  explicit: false,
  artwork: { mimeType: 'image/jpeg', width: 3000, height: 3000 },
  credits: [{ roles: ['songwriter'], songwriterSplit: 100, masterSplit: 100 }],
};

const check = (facts: Partial<DistributionFacts> = {}) =>
  checkDistributionFacts({ ...readyFacts, ...facts }, { today: TODAY });

describe('lead time', () => {
  it('defaults to 14 days and only takes the four choices', () => {
    expect(readLeadDays({})).toBe(DEFAULT_HANDOFF_LEAD_DAYS);
    expect(readLeadDays(null)).toBe(14);
    expect(readLeadDays({ handoff_lead_days: 21 })).toBe(21);
    expect(readLeadDays({ handoff_lead_days: 10 })).toBe(14);
    expect(readLeadDays({ handoff_lead_days: '21' })).toBe(14);
  });
});

describe('due date', () => {
  it('counts calendar days back from release day', () => {
    expect(handoffDueDate('2026-11-13', 14)).toBe('2026-10-30');
    expect(handoffDueDate('2026-10-28', 14)).toBe('2026-10-14');
    // Across a month and a year boundary.
    expect(handoffDueDate('2027-01-05', 7)).toBe('2026-12-29');
    // A stored timestamp reads as its day.
    expect(handoffDueDate('2026-11-13T00:00:00+00:00', 28)).toBe('2026-10-16');
    expect(handoffDueDate(null, 14)).toBeNull();
  });

  it('moves every date when the lead time changes from 14 to 21', () => {
    const at14 = handoffDueDate('2026-11-13', 14);
    const at21 = handoffDueDate('2026-11-13', 21);
    expect(at14).toBe('2026-10-30');
    expect(at21).toBe('2026-10-23');
  });

  it('formats as the mock does', () => {
    expect(formatHandoffDay('2026-10-30')).toBe('Fri 30 Oct');
    expect(formatHandoffDay('2026-10-14')).toBe('Wed 14 Oct');
    expect(formatHandoffDay(null)).toBe('');
  });
});

describe('late', () => {
  it('is whole calendar days past due, and due today is not late', () => {
    expect(daysLate('2026-10-14', '2026-10-16')).toBe(2);
    expect(daysLate('2026-10-16', '2026-10-16')).toBe(0);
    expect(daysLate('2026-10-30', '2026-10-16')).toBe(0);
    expect(daysLate(null, '2026-10-16')).toBe(0);
    expect(formatDaysLate(1)).toBe('1 day late');
    expect(formatDaysLate(2)).toBe('2 days late');
  });
});

describe('uploaded is derived from the check', () => {
  const lyrics = { hasArtwork: true, lyrics: 'la la la' };

  it('a ready rollout with lyrics has all three uploaded', () => {
    const result = check();
    expect(isUploaded('master', result, lyrics)).toBe(true);
    expect(isUploaded('cover_art', result, lyrics)).toBe(true);
    expect(isUploaded('metadata', result, lyrics)).toBe(true);
  });

  it('a 3000px JPG is uploaded; a 1400px one, or none, is not', () => {
    expect(isUploaded('cover_art', check(), lyrics)).toBe(true);
    const small = check({ artwork: { mimeType: 'image/jpeg', width: 1400, height: 1400 } });
    expect(isUploaded('cover_art', small, lyrics)).toBe(false);
    const gone = check({ artwork: null });
    expect(isUploaded('cover_art', gone, { ...lyrics, hasArtwork: false })).toBe(false);
  });

  it('the master is sent from the team’s own files, so it is always ready to approve', () => {
    expect(isUploaded('master', check({ artwork: null, genre: null }), { hasArtwork: false, lyrics: null })).toBe(true);
  });

  it('metadata needs no metadata errors and lyrics; ISRC is optional', () => {
    expect(isUploaded('metadata', check(), { ...lyrics, lyrics: null })).toBe(false);
    expect(isUploaded('metadata', check(), { ...lyrics, lyrics: '   ' })).toBe(false);
    expect(isUploaded('metadata', check({ genre: null }), lyrics)).toBe(false);
    expect(isUploaded('metadata', check({ credits: [] }), lyrics)).toBe(false);
    // Splits that are off are a warning, never a block.
    const off = check({ credits: [{ roles: ['songwriter'], songwriterSplit: 90, masterSplit: null }] });
    expect(isUploaded('metadata', off, lyrics)).toBe(true);
    // A file problem does not hold metadata back.
    expect(isUploaded('metadata', check({ artwork: null }), lyrics)).toBe(true);
  });

  it('a missing row points at the step that fixes it', () => {
    expect(fixFor('cover_art', check({ artwork: null }), lyrics)).toEqual({ fieldPath: 'artwork' });
    expect(fixFor('master', check(), lyrics)).toBeNull();
    expect(fixFor('metadata', check({ genre: null }), lyrics)).toEqual({ fieldPath: 'metadata.genre' });
    expect(fixFor('metadata', check(), { ...lyrics, lyrics: null })).toEqual({ lyrics: true });
  });
});

describe('status', () => {
  const approved = { ...EMPTY_ITEM_RECORD, approvedAt: '2026-10-15T10:00:00Z', approvedBy: 'u1', approvedFor: 'asset-1' };

  it('runs Missing → Uploaded → Approved → Sent', () => {
    expect(deriveHandoffStatus({ uploaded: false, record: EMPTY_ITEM_RECORD, fingerprint: null, task: null })).toBe('missing');
    expect(
      deriveHandoffStatus({ uploaded: true, record: EMPTY_ITEM_RECORD, fingerprint: 'asset-1', task: { status: 'todo' } })
    ).toBe('uploaded');
    expect(deriveHandoffStatus({ uploaded: true, record: approved, fingerprint: 'asset-1', task: { status: 'todo' } })).toBe(
      'approved'
    );
    expect(deriveHandoffStatus({ uploaded: true, record: approved, fingerprint: 'asset-1', task: { status: 'done' } })).toBe(
      'sent'
    );
  });

  it('reads sent from the record while there is no task yet', () => {
    expect(
      deriveHandoffStatus({ uploaded: true, record: approved, fingerprint: 'asset-1', task: null, sentWithoutTask: true })
    ).toBe('sent');
    // Once a task exists it is the one that says.
    expect(
      deriveHandoffStatus({ uploaded: true, record: approved, fingerprint: 'asset-1', task: { status: 'todo' }, sentWithoutTask: true })
    ).toBe('approved');
  });

  it('drops to Missing when the file breaks after approval or sending', () => {
    expect(deriveHandoffStatus({ uploaded: false, record: approved, fingerprint: 'asset-1', task: { status: 'done' } })).toBe(
      'missing'
    );
  });

  it('a replaced file needs a fresh approval', () => {
    expect(deriveHandoffStatus({ uploaded: true, record: approved, fingerprint: 'asset-2', task: { status: 'todo' } })).toBe(
      'uploaded'
    );
  });

  it('offers one action per status', () => {
    expect(rowActionFor('missing')).toBe('fix');
    expect(rowActionFor('uploaded')).toBe('approve');
    expect(rowActionFor('approved')).toBe('send');
    expect(rowActionFor('sent')).toBeNull();
    expect(rowActionLabel('master', 'fix')).toBe('Upload');
    expect(rowActionLabel('cover_art', 'fix')).toBe('Upload');
    expect(rowActionLabel('metadata', 'fix')).toBe('Upload');
    expect(rowActionLabel('master', 'send')).toBe('Mark sent');
  });

  it('only the rollout owner or the item owner may act', () => {
    expect(canActOnItem('owner', 'owner', 'tobi')).toBe(true);
    expect(canActOnItem('tobi', 'owner', 'tobi')).toBe(true);
    expect(canActOnItem('kemi', 'owner', 'tobi')).toBe(false);
    expect(canActOnItem('', 'owner', 'tobi')).toBe(false);
  });
});

describe('header', () => {
  it('reads due, late, all sent and no date', () => {
    expect(handoffHeader({ dueDate: '2026-10-30', today: '2026-10-16', statuses: ['missing', 'uploaded', 'approved'], sentDates: [] })).toEqual({
      kind: 'due',
      dueDate: '2026-10-30',
    });
    expect(handoffHeader({ dueDate: '2026-10-14', today: '2026-10-16', statuses: ['missing', 'missing', 'sent'], sentDates: [] })).toEqual({
      kind: 'late',
      days: 2,
      dueDate: '2026-10-14',
    });
    expect(
      handoffHeader({
        dueDate: '2026-10-14',
        today: '2026-10-16',
        statuses: ['sent', 'sent', 'sent'],
        sentDates: ['2026-10-28T10:00:00Z', '2026-10-29T08:00:00Z', null],
      })
    ).toEqual({ kind: 'all_sent', sentOn: '2026-10-29' });
    expect(handoffHeader({ dueDate: null, today: '2026-10-16', statuses: ['missing', 'missing', 'missing'], sentDates: [] })).toEqual({
      kind: 'no_date',
    });
  });
});

describe('the record on releases.metadata', () => {
  it('reads defensively and writes one item without touching the rest', () => {
    expect(readHandoffRecord(undefined).master).toEqual(EMPTY_ITEM_RECORD);
    const next = withItemRecord({ planner_pending: false, handoff_lead_days: 21 }, 'cover_art', {
      approvedAt: '2026-10-16T10:00:00Z',
      approvedFor: 'asset-9',
    });
    expect(next.handoff_lead_days).toBe(21);
    expect(next.planner_pending).toBe(false);
    const read = readHandoffRecord(next);
    expect(read.cover_art.approvedFor).toBe('asset-9');
    expect(read.master).toEqual(EMPTY_ITEM_RECORD);
  });
});

describe('task sync', () => {
  const task = (overrides: Partial<{ status: string; dueDate: string | null }> = {}) => ({
    id: 't1',
    status: 'todo',
    assignedToUserId: 'owner',
    dueDate: '2026-10-30T00:00:00+00:00',
    completedAt: null,
    ...overrides,
  });

  it('makes a task for each row once there is a due date', () => {
    const ops = planHandoffTaskSync({
      dueDate: '2026-10-30',
      items: [
        { item: 'master', uploaded: false, ownerUserId: 'tobi', task: null },
        { item: 'cover_art', uploaded: true, ownerUserId: 'kemi', task: null },
        { item: 'metadata', uploaded: false, ownerUserId: 'owner', task: null },
      ],
    });
    expect(ops).toEqual([
      { kind: 'insert', item: 'master', dueDate: '2026-10-30', assigneeUserId: 'tobi', done: false },
      { kind: 'insert', item: 'cover_art', dueDate: '2026-10-30', assigneeUserId: 'kemi', done: false },
      { kind: 'insert', item: 'metadata', dueDate: '2026-10-30', assigneeUserId: 'owner', done: false },
    ]);
  });

  it('starts a task done when it was marked sent before there was one', () => {
    expect(
      planHandoffTaskSync({
        dueDate: '2026-10-30',
        items: [
          { item: 'master', uploaded: true, sentBeforeTask: true, ownerUserId: 'o', task: null },
          { item: 'cover_art', uploaded: false, sentBeforeTask: true, ownerUserId: 'o', task: null },
        ],
      }).map((op) => (op.kind === 'insert' ? op.done : null))
    ).toEqual([true, false]);
  });

  it('makes nothing without a release day', () => {
    expect(
      planHandoffTaskSync({ dueDate: null, items: [{ item: 'master', uploaded: false, ownerUserId: 'o', task: null }] })
    ).toEqual([]);
  });

  it('leaves a task alone when it already matches', () => {
    expect(
      planHandoffTaskSync({ dueDate: '2026-10-30', items: [{ item: 'master', uploaded: true, ownerUserId: 'o', task: task() }] })
    ).toEqual([]);
  });

  it('moves the task when the lead time changes', () => {
    expect(
      planHandoffTaskSync({ dueDate: '2026-10-23', items: [{ item: 'master', uploaded: true, ownerUserId: 'o', task: task() }] })
    ).toEqual([{ kind: 'update', item: 'master', taskId: 't1', patch: { due_date: dueDateToTimestamp('2026-10-23') } }]);
  });

  it('clears the date when the release day is removed', () => {
    expect(
      planHandoffTaskSync({ dueDate: null, items: [{ item: 'master', uploaded: true, ownerUserId: 'o', task: task() }] })
    ).toEqual([{ kind: 'update', item: 'master', taskId: 't1', patch: { due_date: null } }]);
  });

  it('reopens a sent task whose file has broken, and keeps a good one done', () => {
    expect(
      planHandoffTaskSync({
        dueDate: '2026-10-30',
        items: [{ item: 'cover_art', uploaded: false, ownerUserId: 'o', task: task({ status: 'done' }) }],
      })
    ).toEqual([{ kind: 'update', item: 'cover_art', taskId: 't1', patch: { status: 'todo', completed_at: null } }]);
    expect(
      planHandoffTaskSync({
        dueDate: '2026-10-30',
        items: [{ item: 'cover_art', uploaded: true, ownerUserId: 'o', task: task({ status: 'done' }) }],
      })
    ).toEqual([]);
  });
});

describe('task ids', () => {
  it('are stable per rollout and item, and shaped as UUIDs', () => {
    const a = handoffTaskId('6a1f3c2e-0000-4000-8000-000000000001', 'master');
    expect(a).toBe(handoffTaskId('6a1f3c2e-0000-4000-8000-000000000001', 'master'));
    expect(a).not.toBe(handoffTaskId('6a1f3c2e-0000-4000-8000-000000000001', 'cover_art'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
