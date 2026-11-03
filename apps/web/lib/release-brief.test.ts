import { describe, expect, it } from 'vitest';

import {
  MAX_DATE_ROWS,
  MAX_REVISIONS,
  SHARE_TOKEN_LENGTH,
  canManageBriefShare,
  cleanBriefDraft,
  parseBriefDraft,
  buildBriefPlanSeed,
  deriveBriefDates,
  deriveBriefPeople,
  firstName,
  formatBriefDay,
  formatHistoryTime,
  generateShareToken,
  initialsFor,
  isBriefEmpty,
  isImageUrl,
  isPlausibleShareToken,
  lagosDay,
  parseDecision,
  parseIdea,
  parseReference,
  referenceSource,
  revisionsToTrim,
  type BriefTaskRow,
} from './release-brief';

function task(over: Partial<BriefTaskRow> & { id: string }): BriefTaskRow {
  return {
    title: over.id,
    status: 'todo',
    due_date: null,
    assigned_to_user_id: null,
    metadata: null,
    position: 0,
    ...over,
  };
}

const milestone = { template: { task_type: 'event_milestone' } };
const key = { planner: { key: true } };

describe('deriveBriefDates', () => {
  it('shows the last done milestone struck, the next ones, then release day last', () => {
    const rows = deriveBriefDates({
      today: '2026-10-16',
      releaseDate: '2026-10-30',
      tasks: [
        task({ id: 'cover', title: 'Cover art final', status: 'done', due_date: '2026-10-13T09:00:00Z', metadata: milestone }),
        task({ id: 'masters', title: 'Masters to TRM', due_date: '2026-10-16T09:00:00Z', metadata: key }),
        task({ id: 'presave', title: 'Pre-save live', due_date: '2026-10-19T09:00:00Z', metadata: milestone }),
        task({ id: 'plain', title: 'Not key', due_date: '2026-10-17T09:00:00Z' }),
      ],
    });
    expect(rows.map((row) => [row.title, row.date, row.done, row.isRelease])).toEqual([
      ['Cover art final', '2026-10-13', true, false],
      ['Masters to TRM', '2026-10-16', false, false],
      ['Pre-save live', '2026-10-19', false, false],
      ['Release', '2026-10-30', false, true],
    ]);
  });

  it('falls back to every dated task when the plan marks nothing key', () => {
    const rows = deriveBriefDates({
      today: '2026-10-01',
      releaseDate: null,
      tasks: [task({ id: 'a', due_date: '2026-10-05' }), task({ id: 'b' })],
    });
    expect(rows.map((row) => row.id)).toEqual(['a']);
  });

  it('never shows more than the row limit, release day included', () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      task({ id: `t${i}`, due_date: `2026-10-${String(i + 2).padStart(2, '0')}`, metadata: milestone })
    );
    const rows = deriveBriefDates({ today: '2026-10-01', releaseDate: '2026-10-30', tasks });
    expect(rows).toHaveLength(MAX_DATE_ROWS);
    expect(rows[rows.length - 1].isRelease).toBe(true);
    expect(rows[0].id).toBe('t0');
  });

  it('drops cancelled tasks and anything on or after release day', () => {
    const rows = deriveBriefDates({
      today: '2026-10-01',
      releaseDate: '2026-10-10',
      tasks: [
        task({ id: 'gone', status: 'cancelled', due_date: '2026-10-05', metadata: milestone }),
        task({ id: 'after', due_date: '2026-10-12', metadata: milestone }),
        task({ id: 'ok', due_date: '2026-10-03', metadata: milestone }),
      ],
    });
    expect(rows.map((row) => row.id)).toEqual(['ok', 'release']);
  });

  it('reads a late-evening UTC time as the next day in Lagos', () => {
    expect(lagosDay('2026-10-16T23:30:00Z')).toBe('2026-10-17');
    expect(lagosDay('2026-10-16')).toBe('2026-10-16');
    expect(lagosDay('nonsense')).toBeNull();
  });
});

describe('deriveBriefPeople', () => {
  it('lists each assignee with their next open task and open count, busiest first', () => {
    const people = deriveBriefPeople({
      profiles: [
        { id: 'u1', name: 'Kemi Kuti', email: 'k@x.co' },
        { id: 'u2', name: null, email: 'chidi@x.co' },
      ],
      tasks: [
        task({ id: '1', title: 'Teaser video', assigned_to_user_id: 'u2', due_date: '2026-10-20' }),
        task({ id: '2', title: 'Later thing', assigned_to_user_id: 'u2' }),
        task({ id: '3', title: 'Edit', assigned_to_user_id: 'u2', due_date: '2026-10-25' }),
        task({ id: '4', title: 'Cover art', assigned_to_user_id: 'u1', due_date: '2026-10-18' }),
        task({ id: '5', title: 'Done one', assigned_to_user_id: 'u1', status: 'done' }),
        task({ id: '6', title: 'Nobody' }),
      ],
    });
    expect(people).toEqual([
      { key: 'u2', name: 'chidi', initials: 'CH', nextTask: 'Teaser video', openCount: 3 },
      { key: 'u1', name: 'Kemi', initials: 'KK', nextTask: 'Cover art', openCount: 1 },
    ]);
  });

  it('leaves out a person whose work is all done', () => {
    expect(
      deriveBriefPeople({
        profiles: [],
        tasks: [task({ id: '1', assigned_to_user_id: 'u1', status: 'done' })],
      })
    ).toEqual([]);
  });
});

describe('revisionsToTrim', () => {
  it(`keeps the newest ${MAX_REVISIONS} and names the rest`, () => {
    const rows = Array.from({ length: 33 }, (_, i) => ({
      id: `r${String(i).padStart(2, '0')}`,
      created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    }));
    expect(revisionsToTrim(rows).sort()).toEqual(['r00', 'r01', 'r02']);
    expect(revisionsToTrim(rows.slice(0, 30))).toEqual([]);
  });

  it('breaks a tie on time the same way whatever order the rows came in', () => {
    const at = '2026-10-01T00:00:00Z';
    const rows = [
      { id: 'a', created_at: at },
      { id: 'b', created_at: at },
      { id: 'c', created_at: at },
    ];
    expect(revisionsToTrim(rows, 2)).toEqual(['a']);
    expect(revisionsToTrim([...rows].reverse(), 2)).toEqual(['a']);
  });
});

describe('generateShareToken', () => {
  it('makes a token of the right length from the safe alphabet', () => {
    const token = generateShareToken();
    expect(token).toHaveLength(SHARE_TOKEN_LENGTH);
    expect(token).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/);
    expect(isPlausibleShareToken(token)).toBe(true);
  });

  it('skips biased bytes rather than wrapping them', () => {
    const token = generateShareToken((length) => new Uint8Array(length).fill(255).map((v, i) => (i % 2 ? 0 : v)));
    // Every 255 is skipped; every 0 maps to the first letter.
    expect(token).toBe('a'.repeat(SHARE_TOKEN_LENGTH));
  });

  it('two tokens differ', () => {
    expect(generateShareToken()).not.toBe(generateShareToken());
  });

  it('rejects junk as a token', () => {
    expect(isPlausibleShareToken('short')).toBe(false);
    expect(isPlausibleShareToken('has spaces in it here ok')).toBe(false);
    expect(isPlausibleShareToken(42)).toBe(false);
  });
});

describe('parsing', () => {
  it('keeps line breaks in the idea and trims the end', () => {
    expect(parseIdea({ idea: 'One\r\nTwo  \n' })).toEqual({ ok: true, value: 'One\nTwo' });
    expect(parseIdea({ idea: 5 }).ok).toBe(false);
    expect(parseIdea({ idea: 'x'.repeat(5000) }).ok).toBe(false);
  });

  it('makes a decision one line and refuses an empty one', () => {
    expect(parseDecision({ body: '  Cover:\n neon B ' })).toEqual({ ok: true, value: 'Cover: neon B' });
    expect(parseDecision({ body: '   ' }).ok).toBe(false);
  });

  it('adds https to a bare link and turns an image link into an image', () => {
    expect(parseReference({ url: 'open.spotify.com/playlist/1', title: ' Night drive ' })).toEqual({
      ok: true,
      value: { kind: 'link', url: 'https://open.spotify.com/playlist/1', title: 'Night drive' },
    });
    const image = parseReference({ url: 'https://i.example.com/a/cover.JPG?w=200' });
    expect(image.ok && image.value.kind).toBe('image');
    expect(parseReference({ url: 'javascript:alert(1)' }).ok).toBe(false);
    expect(parseReference({ url: 'notalink' }).ok).toBe(false);
  });

  it('names a known source and falls back to the host', () => {
    expect(referenceSource('https://open.spotify.com/x')).toBe('Spotify');
    expect(referenceSource('https://youtu.be/abc')).toBe('YouTube');
    expect(referenceSource('https://www.example.com/a')).toBe('example.com');
    expect(isImageUrl('https://example.com/a.webp')).toBe(true);
    expect(isImageUrl('https://example.com/a')).toBe(false);
  });
});

describe('who may switch the view link', () => {
  it('is the owner, or a team owner or admin', () => {
    expect(canManageBriefShare({ releaseOwnerId: 'o', userId: 'o', memberRole: null })).toBe(true);
    expect(canManageBriefShare({ releaseOwnerId: 'o', userId: 'm', memberRole: 'admin' })).toBe(true);
    expect(canManageBriefShare({ releaseOwnerId: 'o', userId: 'm', memberRole: 'owner' })).toBe(true);
    expect(canManageBriefShare({ releaseOwnerId: 'o', userId: 'm', memberRole: 'member' })).toBe(false);
    expect(canManageBriefShare({ releaseOwnerId: 'o', userId: 'm', memberRole: 'guest' })).toBe(false);
    expect(canManageBriefShare({ releaseOwnerId: 'o', userId: 'm', memberRole: undefined })).toBe(false);
  });
});

describe('formatting', () => {
  it('writes days as the mock does', () => {
    expect(formatBriefDay('2026-10-16')).toBe('Fri 16 Oct');
    expect(formatBriefDay('2026-10-30')).toBe('Fri 30 Oct');
    expect(formatBriefDay(null)).toBe('');
  });

  it('writes history times as the mock does', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    expect(formatHistoryTime('2026-10-16T11:59:40Z', now)).toBe('now');
    expect(formatHistoryTime('2026-10-16T10:00:00Z', now)).toBe('2h');
    expect(formatHistoryTime('2026-10-15T10:00:00Z', now)).toBe('Yesterday');
    expect(formatHistoryTime('2026-10-12T10:00:00Z', now)).toBe('Mon');
    expect(formatHistoryTime('2026-10-01T10:00:00Z', now)).toBe('1 Oct');
  });

  it('names people by first name and two initials', () => {
    expect(firstName('Oyin Wenapere')).toBe('Oyin');
    expect(firstName('', 'kemi@x.co')).toBe('kemi');
    expect(initialsFor('Oyin Wenapere')).toBe('OW');
    expect(initialsFor('Ade')).toBe('AD');
  });
});

describe('isBriefEmpty and the AI draft cleanup', () => {
  it('is empty only with no idea, references or decisions', () => {
    expect(isBriefEmpty({ idea: ' ', references: [], decisions: [] })).toBe(true);
    expect(isBriefEmpty({ idea: 'x', references: [], decisions: [] })).toBe(false);
  });

  it('strips wrappers the model sometimes adds', () => {
    expect(cleanBriefDraft('**Idea:** "A late-night song.\n\nWarm."')).toBe('A late-night song. Warm.');
    expect(cleanBriefDraft('   ')).toBeNull();
  });
});

describe('undated plans in the brief', () => {
  const task = (id: string, offset: number, now = false, status = 'todo') => ({
    id,
    title: `Task ${id}`,
    status,
    due_date: null,
    assigned_to_user_id: null,
    metadata: { planner_v2: { offset_days: offset, now } },
    position: 0,
  });

  it('shows relative timing and a Pick a day release row', () => {
    const rows = deriveBriefDates({
      tasks: [task('b', -28), task('a', -60, true), task('c', -14)],
      releaseDate: null,
      today: '2026-10-26',
    });
    expect(rows.map((r) => r.when)).toEqual(['Now', '4 weeks before', '2 weeks before', 'Pick a day']);
    expect(rows[rows.length - 1].isRelease).toBe(true);
  });

  it('leaves done tasks out', () => {
    const rows = deriveBriefDates({ tasks: [task('a', -28, false, 'done')], releaseDate: null, today: '2026-10-26' });
    expect(rows.map((r) => r.id)).toEqual(['release']);
  });
});

describe('buildBriefPlanSeed', () => {
  it('turns the plan into an idea and decisions', () => {
    const seed = buildBriefPlanSeed({
      built_for: { summary: 'A Lagos single for Audiomack first.', win: '50k streams in 6 weeks', constraints: ['Two people'] },
      budget: { total_naira: 0 },
      answers: { channels: ['audiomack', 'tiktok'] },
    });
    expect(seed?.idea).toBe('A Lagos single for Audiomack first. Goal: 50k streams in 6 weeks. Keep in mind: Two people.');
    expect(seed?.decisions).toEqual([
      'Win: 50k streams in 6 weeks',
      'Promo spend: ₦0, free channels only',
      'Channels: Audiomack, TikTok',
    ]);
  });

  it('offers nothing for a plan with no content', () => {
    expect(buildBriefPlanSeed(null)).toBeNull();
    expect(buildBriefPlanSeed({ built_for: {} })).toBeNull();
  });

  it('leads with what the team said on the idea card, with or without a plan', () => {
    expect(buildBriefPlanSeed(null, ['Slow burn, late night.'])?.idea).toBe('Slow burn, late night.');
    const seed = buildBriefPlanSeed({ built_for: { summary: 'Built for Audiomack.' } }, ['Slow burn.', 'Hazy video.']);
    expect(seed?.idea).toBe('Slow burn. Hazy video. Built for Audiomack.');
  });
});

describe('parseBriefDraft', () => {
  it('reads the first board from JSON', () => {
    const draft = parseBriefDraft('```json\n{"headline":"Tell the truth.","idea":"A warm record.","feels_like":["Sunlit"],"not_this":["Glossy"]}\n```');
    expect(draft).toEqual({ idea: 'A warm record.', feel: { headline: 'Tell the truth.', feelsLike: ['Sunlit'], notThis: ['Glossy'] } });
  });

  it('takes plain text as the idea when the model ignored the format', () => {
    expect(parseBriefDraft('A late-night song. Warm.')).toEqual({
      idea: 'A late-night song. Warm.',
      feel: { headline: '', feelsLike: [], notThis: [] },
    });
  });

  it('is null with no idea at all', () => {
    expect(parseBriefDraft('   ')).toBeNull();
    expect(parseBriefDraft('{"headline":"Only a line"}')).toBeNull();
  });
});
