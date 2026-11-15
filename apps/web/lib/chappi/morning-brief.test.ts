import { describe, expect, it } from 'vitest';
import {
  applyBriefWording,
  buildMorningBrief,
  lagosDateKey,
  lagosDaysUntil,
  morningBriefText,
  parseBriefWording,
  sanitizeMorningBrief,
  type BriefInput,
  type BriefTask,
} from './morning-brief';

const ME = '11111111-1111-4111-8111-111111111111';
const ADA = '22222222-2222-4222-8222-222222222222';
const REL = '33333333-3333-4333-8333-333333333333';
// 08:00 Lagos on Wed 11 Nov 2026.
const NOW = new Date('2026-11-11T07:00:00Z');

let seq = 0;
function task(over: Partial<BriefTask>): BriefTask {
  seq += 1;
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, '0')}`,
    title: `Task ${seq}`,
    releaseId: REL,
    status: 'todo',
    dueDate: null,
    completedAt: null,
    assignedToUserId: ME,
    ...over,
  };
}

function input(over: Partial<BriefInput> = {}): BriefInput {
  return {
    userId: ME,
    firstName: 'Wena',
    tasks: [],
    releases: [{ id: REL, title: 'Midnight', artistName: 'Dorian', releaseDate: '2026-11-20' }],
    since: new Date(NOW.getTime() - 24 * 3600_000),
    now: NOW,
    ...over,
  };
}

describe('Lagos calendar', () => {
  it('rolls over at Lagos midnight, not UTC midnight', () => {
    expect(lagosDateKey(new Date('2026-11-10T23:30:00Z'))).toBe('2026-11-11');
    expect(lagosDateKey(new Date('2026-11-10T22:30:00Z'))).toBe('2026-11-10');
  });

  it('counts whole days to a date', () => {
    expect(lagosDaysUntil('2026-11-20', NOW)).toBe(9);
    expect(lagosDaysUntil('2026-11-11', NOW)).toBe(0);
    expect(lagosDaysUntil('2026-11-09', NOW)).toBe(-2);
    expect(lagosDaysUntil('nonsense', NOW)).toBeNull();
  });
});

describe('buildMorningBrief', () => {
  it('lists my late work first, then today, then this week, and nobody else', () => {
    const brief = buildMorningBrief(
      input({
        tasks: [
          task({ title: 'Week', dueDate: '2026-11-14' }),
          task({ title: 'Today', dueDate: '2026-11-11' }),
          task({ title: 'Late', dueDate: '2026-11-09' }),
          task({ title: 'Not mine', dueDate: '2026-11-09', assignedToUserId: ADA }),
          task({ title: 'Done', dueDate: '2026-11-09', status: 'done' }),
          task({ title: 'Far', dueDate: '2026-12-30' }),
        ],
      })
    );
    expect(brief.needs.map((item) => item.text)).toEqual(['Late · Midnight', 'Today · Midnight', 'Week · Midnight']);
    expect(brief.needs[0]).toMatchObject({ tone: 'late', meta: '2 days late' });
    expect(brief.needs[1].meta).toBe('Due today');
    expect(brief.needs[2].meta).toBe('Due Sat 14 Nov');
  });

  it('shows what teammates finished since yesterday, not my work or older work', () => {
    const brief = buildMorningBrief(
      input({
        tasks: [
          task({
            title: 'Radio edit',
            status: 'done',
            assignedToUserId: ADA,
            assigneeName: 'Ada Obi',
            completedAt: '2026-11-10T15:00:00Z',
          }),
          task({ title: 'Mine', status: 'done', completedAt: '2026-11-10T15:00:00Z' }),
          task({ title: 'Old', status: 'done', assignedToUserId: ADA, completedAt: '2026-11-01T15:00:00Z' }),
        ],
      })
    );
    expect(brief.changed.map((item) => item.text)).toEqual(['Ada finished Radio edit']);
    expect(brief.changed[0].tone).toBe('good');
  });

  it('lists release days in the next two weeks only', () => {
    const brief = buildMorningBrief(input());
    expect(brief.upcoming).toEqual([
      { text: 'Midnight comes out', meta: 'Fri 20 Nov · 9 days', tone: 'plain', href: `/dashboard?release=${REL}` },
    ]);
    const past = buildMorningBrief(
      input({ releases: [{ id: REL, title: 'Old one', artistName: 'D', releaseDate: '2026-11-01' }] })
    );
    expect(past.upcoming).toEqual([]);
  });

  it('makes the first need the next step', () => {
    const brief = buildMorningBrief(input({ tasks: [task({ title: 'Cover art final', dueDate: '2026-11-09' })] }));
    expect(brief.next?.text).toBe('Cover art final first. It is 2 days late.');
    expect(brief.next?.taskId).toBe(brief.needs[0].taskId);
    expect(brief.lede).toBe('Midnight comes out in 9 days. 1 thing is late.');
  });

  it('points at the nearest rollout when nothing needs you', () => {
    const brief = buildMorningBrief(input());
    expect(brief.next).toEqual({
      text: 'Check what is left on Midnight while it is quiet.',
      label: 'Open the rollout',
      href: `/dashboard?release=${REL}`,
    });
  });

  it('still writes a short brief on a quiet day', () => {
    const brief = buildMorningBrief(input({ releases: [] }));
    expect(brief.lede).toBe('Nothing is late and nothing changed overnight.');
    expect(brief.needs).toEqual([]);
    expect(brief.next).toBeNull();
    expect(brief.date).toBe('2026-11-11');
  });

  it('never writes an em dash', () => {
    const brief = buildMorningBrief(input({ tasks: [task({ title: 'Mix — final', dueDate: '2026-11-11' })] }));
    expect(JSON.stringify(brief)).not.toContain('—');
  });
});

describe('AI wording', () => {
  const base = buildMorningBrief(
    input({ tasks: [task({ title: 'A', dueDate: '2026-11-09' }), task({ title: 'B', dueDate: '2026-11-11' })] })
  );

  it('takes a good answer and keeps every fact', () => {
    const wording = parseBriefWording(JSON.stringify({ lede: 'Busy day.', firstNeed: 1, nextText: 'Do B first.' }), 2);
    const brief = applyBriefWording(base, wording);
    expect(brief.lede).toBe('Busy day.');
    expect(brief.next).toEqual({ text: 'Do B first.', label: 'Open it', taskId: base.needs[1].taskId });
    expect(brief.needs).toEqual(base.needs);
  });

  it('refuses an index that is not a need, and bad JSON', () => {
    expect(parseBriefWording(JSON.stringify({ lede: 'x', firstNeed: 5, nextText: 'y' }), 2)).toBeNull();
    expect(parseBriefWording('not json', 2)).toBeNull();
    expect(applyBriefWording(base, null)).toBe(base);
  });
});

describe('sanitizeMorningBrief', () => {
  it('round-trips a built brief', () => {
    const brief = buildMorningBrief(input({ tasks: [task({ dueDate: '2026-11-09' })] }));
    expect(sanitizeMorningBrief(JSON.parse(JSON.stringify(brief)))).toEqual(brief);
  });

  it('drops links that leave the app', () => {
    const brief = sanitizeMorningBrief({
      v: 1,
      date: '2026-11-11',
      greeting: 'Hi',
      lede: 'x',
      needs: [
        { text: 'a', href: 'https://evil.test' },
        { text: 'b', href: '//evil.test' },
      ],
      changed: [],
      upcoming: [],
      next: { text: 'go', label: 'Go', href: 'javascript:alert(1)' },
    });
    expect(brief?.needs.every((item) => !item.href)).toBe(true);
    expect(brief?.next?.href).toBeUndefined();
  });

  it('refuses something that is not a brief', () => {
    expect(sanitizeMorningBrief({ v: 2 })).toBeNull();
    expect(sanitizeMorningBrief(null)).toBeNull();
  });
});

describe('morningBriefText', () => {
  it('reads as plain text for the model', () => {
    const text = morningBriefText(buildMorningBrief(input({ tasks: [task({ title: 'A', dueDate: '2026-11-09' })] })));
    expect(text).toContain('Good morning, Wena.');
    expect(text).toContain('Needs you today:\n- A · Midnight (2 days late)');
    expect(text).toContain('Coming up:');
  });
});

describe('the brief follows the answers (#1314)', () => {
  const REL2 = '44444444-4444-4444-8444-444444444444';
  const releases = [
    { id: REL, title: 'Midnight', artistName: 'Dorian', artistId: 'dorian', releaseDate: '2026-11-20' },
    { id: REL2, title: 'Okada', artistName: 'Ayo', artistId: 'ayo', releaseDate: '2026-11-15' },
  ];

  it('leaves a brief with no answers as it was', () => {
    const brief = buildMorningBrief(input({ tasks: [task({ dueDate: '2026-11-09' })] }));
    expect(brief.order).toBeUndefined();
    expect(brief.because).toBeUndefined();
    expect(brief.waiting).toBeUndefined();
    expect(brief.question).toBeUndefined();
  });

  it('puts release days first and says why', () => {
    const brief = buildMorningBrief(input({ prefs: { top: { value: 'releases', at: '2026-11-10' } } }));
    expect(brief.order?.[0]).toBe('upcoming');
    expect(brief.because).toBe('Release days first, like you asked');
  });

  it('shows only today when asked, and the focus artist first', () => {
    const brief = buildMorningBrief(
      input({
        releases,
        tasks: [
          task({ title: 'Later', dueDate: '2026-11-14', releaseId: REL }),
          task({ title: 'Late Midnight', dueDate: '2026-11-09', releaseId: REL }),
          task({ title: 'Today Okada', dueDate: '2026-11-11', releaseId: REL2 }),
        ],
        prefs: {
          horizon: { value: 'today', at: '2026-11-10' },
          artist: { value: 'ayo', name: 'Ayo', month: '2026-11', at: '2026-11-10' },
        },
      })
    );
    // Only today: 'Later' is gone. Late work still leads; the focus artist only
    // goes first within the same urgency.
    expect(brief.needs.map((item) => item.text.split(' · ')[0])).toEqual(['Late Midnight', 'Today Okada']);
    expect(brief.upcoming[0].text).toContain('Okada');
  });

  it('never lets the focus artist push late work out', () => {
    const brief = buildMorningBrief(
      input({
        releases,
        tasks: [
          ...[1, 2, 3, 4].map((n) => task({ title: `Ayo ${n}`, dueDate: '2026-11-13', releaseId: REL2 })),
          task({ title: 'Late Midnight', dueDate: '2026-11-09', releaseId: REL }),
        ],
        prefs: { artist: { value: 'ayo', name: 'Ayo', month: '2026-11', at: '2026-11-10' } },
      })
    );
    expect(brief.needs[0].text.split(' · ')[0]).toBe('Late Midnight');
  });

  it('adds the watched teammate\'s late work', () => {
    const brief = buildMorningBrief(
      input({
        tasks: [
          task({ title: 'Mix', assignedToUserId: ADA, dueDate: '2026-11-08' }),
          task({ title: 'Not late', assignedToUserId: ADA, dueDate: '2026-11-12' }),
        ],
        prefs: { watch: { value: ADA, name: 'Ada Obi', at: '2026-11-10' } },
      })
    );
    expect(brief.waitingOn).toBe('Ada');
    expect(brief.waiting?.map((item) => item.meta)).toEqual(['3 days late']);
    expect(morningBriefText(brief)).toContain('Waiting on Ada');
  });

  it('carries the question through storage and into the text', () => {
    const question = {
      id: 'top' as const,
      text: 'What do you want at the top each morning?',
      choices: [
        { id: 'late', label: "What's late" },
        { id: 'releases', label: 'Release days' },
      ],
    };
    const brief = buildMorningBrief(input({ question, prefs: { top: { value: 'team', at: '2026-11-10' } } }));
    const back = sanitizeMorningBrief(JSON.parse(JSON.stringify(brief)));
    expect(back?.question).toEqual(question);
    expect(back?.order).toEqual(brief.order);
    expect(back?.because).toBe(brief.because);
    expect(morningBriefText(brief)).toContain("Today's question");
  });
});
