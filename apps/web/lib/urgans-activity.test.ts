import { describe, expect, it } from 'vitest';
import { describeActivity, diffSnapshots, type UrgansActivityRow } from './urgans-activity';

const ME = 'me';
const NOW = new Date('2026-10-27T12:00:00Z');

function row(over: Partial<UrgansActivityRow>): UrgansActivityRow {
  return {
    id: 'a1',
    createdAt: '2026-10-27T08:14:00Z',
    source: 'chat',
    trigger: 'message',
    tool: 'create_task',
    actorUserId: ME,
    releaseId: 'r1',
    objectType: 'task',
    objectId: 't1',
    args: { title: 'Book radio interview' },
    before: null,
    after: null,
    confirmed: false,
    ok: true,
    summary: 'Task created.',
    error: null,
    ...over,
  };
}

const names = { me: 'Oyin Wenapere', tunde: 'Tunde Bakare', ada: 'Ada Obi' };

describe('describeActivity', () => {
  it('names the change with the object in quotes', () => {
    const d = describeActivity(row({ tool: 'complete_task', before: { title: 'Send master' } }), ME, names, NOW);
    expect(d.title).toBe('Marked "Send master" done');
  });

  it('reads a new task title from the arguments', () => {
    expect(describeActivity(row({}), ME, names, NOW).title).toBe('Added task "Book radio interview"');
  });

  it('says the release day move with both dates', () => {
    const d = describeActivity(
      row({
        tool: 'schedule_release',
        objectType: 'release',
        before: { title: 'Midnight EP', release_date: '2026-11-14' },
        after: { title: 'Midnight EP', release_date: '2026-11-21' },
      }),
      ME,
      names,
      NOW
    );
    expect(d.title).toBe('Moved release day from 14 Nov to 21 Nov');
  });

  it('says who asked and where, in plain words', () => {
    expect(describeActivity(row({}), ME, names, NOW).meta).toBe('You asked in chat · Today, 9:14');
    expect(
      describeActivity(row({ source: 'voice', actorUserId: 'ada' }), ME, names, NOW).meta
    ).toBe('Ada asked on a voice call · Today, 9:14');
    expect(
      describeActivity(
        row({ source: 'whatsapp', tool: 'whatsapp.mark_done', actorUserId: 'tunde', args: { reply: 'Done' }, before: { status: 'todo' } }),
        ME,
        names,
        NOW
      ).meta
    ).toBe('Tunde replied "Done" on WhatsApp · Today, 9:14');
  });

  it('adds the approval when a person approved it', () => {
    expect(describeActivity(row({ confirmed: true }), ME, names, NOW).meta).toBe(
      'You asked in chat · You approved it · Today, 9:14'
    );
  });

  it('labels a cron chase as the daily check-in', () => {
    const d = describeActivity(
      row({ source: 'cron', trigger: 'daily_sweep', tool: 'whatsapp.chase', actorUserId: 'tunde', summary: 'Chased Tunde about "Cover art final" on WhatsApp', createdAt: '2026-10-26T07:00:00Z' }),
      ME,
      names,
      NOW
    );
    expect(d.title).toBe('Reminded Tunde about "Cover art final"');
    expect(d.meta).toBe('Daily check-in · Yesterday, 8:00');
    expect(d.icon).toBe('clock');
  });

  it('uses Lagos time and short weekday for older rows', () => {
    const d = describeActivity(row({ createdAt: '2026-10-20T15:05:00Z' }), ME, names, NOW);
    expect(d.meta).toBe('You asked in chat · Tue 20 Oct');
  });

  it('marks a failure', () => {
    const d = describeActivity(row({ ok: false, error: 'Not found.' }), ME, names, NOW);
    expect(d.failed).toBe(true);
    expect(d.failure).toBe("Didn't work: Not found.");
  });

  it('falls back to the summary for a tool it has no words for', () => {
    expect(describeActivity(row({ tool: 'mystery_tool', summary: 'Did a thing. And more.', args: {} }), ME, names, NOW).title).toBe(
      'Did a thing.'
    );
  });

  it('never uses an em dash', () => {
    const d = describeActivity(row({ tool: 'update_release', objectType: 'release', before: { title: 'X' } }), ME, names, NOW);
    expect(`${d.title}${d.meta}`).not.toContain('—');
  });
});

describe('diffSnapshots', () => {
  it('lists the fields that changed, in plain names', () => {
    expect(
      diffSnapshots({ status: 'todo', title: 'A', updated_at: '1' }, { status: 'done', title: 'A', updated_at: '2' })
    ).toEqual([{ field: 'Status', from: 'todo', to: 'done' }]);
  });

  it('handles a missing side', () => {
    expect(diffSnapshots(null, { due_date: '2026-11-01T11:00:00Z' })).toEqual([
      { field: 'Due date', from: '', to: '1 Nov' },
    ]);
    expect(diffSnapshots(null, null)).toEqual([]);
  });

  it('stops at six fields and skips ids and nested objects', () => {
    const before = { id: 'x', a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, meta: { x: 1 } };
    const after = { id: 'y', a: 2, b: 2, c: 2, d: 2, e: 2, f: 2, g: 2, meta: { x: 2 } };
    const diff = diffSnapshots(before, after);
    expect(diff).toHaveLength(6);
    expect(diff.map((d) => d.field)).not.toContain('Id');
    expect(diff.map((d) => d.field)).not.toContain('Meta');
  });
});
