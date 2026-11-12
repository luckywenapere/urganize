import { describe, expect, it } from 'vitest';
import type { TrmRow } from './release';
import { distributeChecklist, leftHeading, leftReason, readyLine } from './distribute-checklist';

function row(over: Partial<TrmRow> & { key: string }): TrmRow {
  return {
    title: over.key,
    detail: '',
    ok: false,
    fix: null,
    action: 'fix',
    ownerItem: 'metadata',
    ...over,
  };
}

const READY: TrmRow[] = [
  row({ key: 'cover_art', ok: true, action: null, detail: '3000 × 3000 · JPG · 2.1 MB' }),
  row({ key: 'details', ok: true, action: null, detail: 'Afrobeats · English · Clean · Independent' }),
  row({ key: 'credits', ok: true, action: null, detail: '2 writers · 1 producer · splits 100%' }),
  row({ key: 'rights', ok: true, action: null, detail: 'Defaults · Worldwide' }),
];

const base = {
  blocking: [] as TrmRow[],
  ready: READY,
  masters: [null] as Array<{ fileName: string | null } | null>,
  songsListedApart: false,
  explicitPerSong: false,
};

describe('distributeChecklist', () => {
  it('lists the five rows in order: master, cover art, details, credits, rights', () => {
    const { rows } = distributeChecklist(base);
    expect(rows.map((r) => r.key)).toEqual(['master', 'cover_art', 'details', 'credits', 'rights']);
    expect(rows.map((r) => r.title)).toEqual(['Master', 'Cover art', 'Details', 'Credits', 'Rights and policies']);
  });

  it('marks everything ready and leaves nothing when nothing blocks', () => {
    const result = distributeChecklist(base);
    expect(result.rows.filter((r) => r.state === 'todo')).toEqual([]);
    expect(result.left).toBe(0);
  });

  it('adds the master at send when none is uploaded, and does not count it as left', () => {
    const { rows, left } = distributeChecklist(base);
    expect(rows[0]).toMatchObject({ key: 'master', state: 'at_send', detail: 'Added when you send · WAV up to 150 MB' });
    expect(left).toBe(0);
  });

  it('ticks the master with the real count when every song has one', () => {
    const one = distributeChecklist({ ...base, masters: [{ fileName: 'owambe.wav' }] });
    expect(one.rows[0]).toMatchObject({ title: 'Master', state: 'ready', detail: '1 song uploaded' });
    const three = distributeChecklist({ ...base, masters: [{ fileName: 'a' }, { fileName: 'b' }, { fileName: 'c' }] });
    expect(three.rows[0]).toMatchObject({ title: 'Masters', state: 'ready', detail: '3 songs uploaded' });
  });

  it('says "one WAV per song" for a release with more than one song and no masters yet', () => {
    const { rows } = distributeChecklist({ ...base, masters: [null, { fileName: 'b' }] });
    expect(rows[0]).toMatchObject({ title: 'Masters', state: 'at_send', detail: 'Added when you send · one WAV per song' });
  });

  it('says cover art is ready for stores, with its real size', () => {
    const { rows } = distributeChecklist(base);
    expect(rows[1].detail).toBe('3000 × 3000 · JPG · 2.1 MB · Ready for stores');
  });

  it('shows the cover art problem and counts it as left', () => {
    const blocking = [row({ key: 'cover_art', detail: 'Not added', action: 'upload', fix: 'artwork', ownerItem: 'cover_art' })];
    const ready = READY.filter((r) => r.key !== 'cover_art');
    const { rows, left } = distributeChecklist({ ...base, blocking, ready });
    expect(rows[1]).toMatchObject({ state: 'todo', detail: 'Not added' });
    expect(rows[1].issues).toHaveLength(1);
    expect(left).toBe(1);
  });

  it('folds missing details into one Details row, counted once, with "N of M filled in"', () => {
    const blocking = [
      row({ key: 'genre', detail: 'Not set', fix: 'metadata.genre' }),
      row({ key: 'language', detail: 'Not set', fix: 'metadata.language' }),
    ];
    const { rows, left } = distributeChecklist({ ...base, blocking });
    const details = rows.find((r) => r.key === 'details');
    // Title, artist, release date, genre, language, explicit: 6 facts, 2 missing.
    expect(details).toMatchObject({ state: 'todo', detail: '4 of 6 filled in' });
    expect(details?.issues.map((i) => i.key)).toEqual(['genre', 'language']);
    expect(left).toBe(1);
  });

  it('does not count explicit as a detail when each song answers it', () => {
    const blocking = [row({ key: 'genre', detail: 'Not set' })];
    const { rows } = distributeChecklist({ ...base, blocking, explicitPerSong: true });
    expect(rows.find((r) => r.key === 'details')?.detail).toBe('4 of 5 filled in');
  });

  it('says how many things to fix when a detail is set but not good enough (a date too soon)', () => {
    const blocking = [row({ key: 'release_date', detail: '9 days out · TRM needs 14', action: 'move', fix: 'release_date' })];
    const { rows } = distributeChecklist({ ...base, blocking });
    expect(rows.find((r) => r.key === 'details')?.detail).toBe('1 thing to fix');
  });

  it('keeps the ready details line when every detail is in', () => {
    const { rows } = distributeChecklist(base);
    expect(rows.find((r) => r.key === 'details')).toMatchObject({ state: 'ready', detail: 'Afrobeats · English · Clean · Independent' });
  });

  it('puts a blocking row it does not know under Details, so nothing is dropped', () => {
    const blocking = [row({ key: 'something_new', detail: 'Not set' })];
    const { rows, left } = distributeChecklist({ ...base, blocking });
    expect(rows.find((r) => r.key === 'details')?.issues.map((i) => i.key)).toEqual(['something_new']);
    expect(left).toBe(1);
  });

  it('shows the credits problem and counts it', () => {
    const blocking = [row({ key: 'credits', detail: 'No producer yet', action: 'ask', fix: 'credits' })];
    const ready = READY.filter((r) => r.key !== 'credits');
    const { rows, left } = distributeChecklist({ ...base, blocking, ready });
    expect(rows.find((r) => r.key === 'credits')).toMatchObject({ state: 'todo', detail: 'No producer yet' });
    expect(left).toBe(1);
  });

  it('keeps song problems under Details for a single, but apart when the songs are listed above', () => {
    const blocking = [row({ key: 'song:t1', trackId: 't1', detail: 'Explicit not answered' })];
    const single = distributeChecklist({ ...base, blocking });
    expect(single.rows.find((r) => r.key === 'details')?.issues.map((i) => i.key)).toEqual(['song:t1']);
    expect(single.songIssues).toEqual([]);
    expect(single.left).toBe(1);

    const ep = distributeChecklist({
      ...base,
      blocking: [...blocking, row({ key: 'song:t2', trackId: 't2' }), row({ key: 'genre', detail: 'Not set' })],
      songsListedApart: true,
    });
    expect(ep.songIssues.map((i) => i.key)).toEqual(['song:t1', 'song:t2']);
    expect(ep.rows.find((r) => r.key === 'details')?.issues.map((i) => i.key)).toEqual(['genre']);
    // Each song with a problem is one thing left, plus the Details row.
    expect(ep.left).toBe(3);
  });

  it('counts the "needs more songs" row as a song issue when the songs are listed apart', () => {
    const { songIssues, left } = distributeChecklist({ ...base, blocking: [row({ key: 'songs' })], songsListedApart: true });
    expect(songIssues.map((i) => i.key)).toEqual(['songs']);
    expect(left).toBe(1);
  });
});

describe('leftHeading', () => {
  it('reads "Ready to send" at zero, and counts otherwise', () => {
    expect(leftHeading(0)).toBe('Ready to send');
    expect(leftHeading(1)).toBe('1 thing left');
    expect(leftHeading(3)).toBe('3 things left');
  });
});

describe('leftReason', () => {
  it('names the one thing left', () => {
    const blocking = [row({ key: 'genre', detail: 'Not set' })];
    const result = distributeChecklist({ ...base, blocking });
    expect(leftReason(result, 'Owambe Season')).toBe('Fill in the details and you can send Owambe Season to the stores.');
  });

  it('names cover art, credits and songs in their own words', () => {
    const cover = distributeChecklist({ ...base, blocking: [row({ key: 'cover_art', detail: 'Not added' })], ready: READY.slice(1) });
    expect(leftReason(cover, 'X')).toBe('Add the cover art and you can send X to the stores.');
    const small = distributeChecklist({ ...base, blocking: [row({ key: 'cover_art', detail: '1400 × 1400 · needs 3000 × 3000' })], ready: READY.slice(1) });
    expect(leftReason(small, 'X')).toBe('Replace the cover art and you can send X to the stores.');
    const credits = distributeChecklist({ ...base, blocking: [row({ key: 'credits' })] });
    expect(leftReason(credits, 'X')).toBe('Finish the credits and you can send X to the stores.');
    const songs = distributeChecklist({ ...base, blocking: [row({ key: 'song:a', trackId: 'a' })], songsListedApart: true });
    expect(leftReason(songs, 'X')).toBe('Finish the songs and you can send X to the stores.');
  });

  it('counts when more than one thing is left', () => {
    const result = distributeChecklist({
      ...base,
      blocking: [row({ key: 'genre' }), row({ key: 'credits' })],
    });
    expect(leftReason(result, 'X')).toBe('Finish the 2 marked rows and you can send X to the stores.');
  });

  it('falls back to "it" when the rollout has no title', () => {
    const result = distributeChecklist({ ...base, blocking: [row({ key: 'genre' })] });
    expect(leftReason(result, '  ')).toBe('Fill in the details and you can send it to the stores.');
  });

  it('says what is ready when nothing is left', () => {
    expect(leftReason(distributeChecklist(base), 'X')).toBe('Everything is in. Send X to the stores.');
  });
});

describe('readyLine', () => {
  it('counts the ready rows in words, and says the master goes in at send', () => {
    expect(readyLine(distributeChecklist(base))).toBe('Five things go to the stores. Four are ready. The master goes in when you send.');
  });

  it('says all are ready when the masters are uploaded too', () => {
    expect(readyLine(distributeChecklist({ ...base, masters: [{ fileName: 'a.wav' }] }))).toBe('Five things go to the stores. All are ready.');
  });

  it('uses "is" for one', () => {
    const blocking = [row({ key: 'cover_art' }), row({ key: 'genre' }), row({ key: 'credits' })];
    const result = distributeChecklist({ ...base, blocking, ready: READY.filter((r) => r.key !== 'cover_art' && r.key !== 'credits') });
    expect(readyLine(result)).toBe('Five things go to the stores. One is ready. The master goes in when you send.');
  });
});
