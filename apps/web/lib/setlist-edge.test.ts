import { describe, expect, it } from 'vitest';
import {
  MAX_ITEM_DURATION_SECONDS,
  buildPackFileName,
  describeSetlistFit,
  formatDuration,
  formatSetTotal,
  parseDurationInput,
  parseSetlistItemCreate,
  parseSetlistItemPatch,
  pickDefaultVersion,
  resolveItemDuration,
  resolveRowVersion,
  summarizeSetlist,
  type SetlistItemType,
} from './setlist';

/**
 * The set: the lengths people type, the total against the slot, which file a
 * row sends, and the names those files land with on a DJ's laptop.
 *
 * Tables rather than prose, because every row here is a thing a real person
 * will type or a real set will contain, and the point is that none of them
 * surprises anybody.
 */

describe('parseDurationInput: what people type', () => {
  it.each([
    // Clock time, the shape the field shows.
    ['3:30', 210],
    ['03:30', 210],
    ['0:45', 45],
    ['3:05', 185],
    ['3:5', 185],
    ['0:01', 1],
    ['19:59', 1199],
    ['20:00', 1200],
    ['0:12:30', 750],
    // A bare number is minutes.
    ['4', 240],
    ['3.5', 210],
    ['3,5', 210],
    ['0.5', 30],
    // Units, spelled every way.
    ['90s', 90],
    ['90 s', 90],
    ['90 sec', 90],
    ['90 secs', 90],
    ['90 seconds', 90],
    ['4m', 240],
    ['4M', 240],
    ['4 min', 240],
    ['4 mins', 240],
    ['4 minute', 240],
    ['4 minutes', 240],
    ['3.5m', 210],
    ['3m 30s', 210],
    ['3m30s', 210],
    ['3 min 30 sec', 210],
    // Stray spaces and the prime marks people in music write.
    [' 3:30 ', 210],
    ['3 : 30', 210],
    ["3'30", 210],
    ['3\'30"', 210],
    ["3'30''", 210],
    ['3’30', 210],
    ['3′30″', 210],
    ["4'", 240],
  ])('reads %j as %i seconds', (typed, seconds) => {
    expect(parseDurationInput(typed)).toEqual({ ok: true, seconds });
  });

  it.each(['', '   ', '\t'])('treats %j as clearing the length', (typed) => {
    expect(parseDurationInput(typed)).toEqual({ ok: true, seconds: null });
  });

  it.each([
    ['3:75', 'Seconds go up to 59. Try 3:30.'],
    ['3:60', 'Seconds go up to 59. Try 3:30.'],
    ['1:60:00', 'Minutes and seconds go up to 59. Try 1:02:03.'],
    ['0:00', 'A length has to be more than nothing.'],
    ['0', 'A length has to be more than nothing.'],
    ['0m', 'A length has to be more than nothing.'],
    ['20:01', 'That is longer than twenty minutes. Check the length.'],
    ['21', 'That is longer than twenty minutes. Check the length.'],
    ['1:00:00', 'That is longer than twenty minutes. Check the length.'],
    ['1:02:03', 'That is longer than twenty minutes. Check the length.'],
    ['abc', 'Type a length like 3:30.'],
    ['-3', 'Type a length like 3:30.'],
    ['3:30:', 'Type a length like 3:30.'],
    [':30', 'Type a length like 3:30.'],
    ['1e3', 'Type a length like 3:30.'],
    ['m', 'Type a length like 3:30.'],
    ['s', 'Type a length like 3:30.'],
    ['3:30pm', 'Type a length like 3:30.'],
    ['٣:٣٠', 'Type a length like 3:30.'],
  ])('refuses %j with a sentence that says what to do', (typed, message) => {
    expect(parseDurationInput(typed)).toEqual({ ok: false, error: message });
  });

  it('shows back and reads back every length a song can have, to the second', () => {
    // Every value from one second to the twenty minute ceiling survives being
    // shown on a row and typed straight back in: 1,200 round trips.
    const failures: number[] = [];
    for (let seconds = 1; seconds <= MAX_ITEM_DURATION_SECONDS; seconds += 1) {
      const parsed = parseDurationInput(formatDuration(seconds));
      if (!parsed.ok || parsed.seconds !== seconds) failures.push(seconds);
    }
    expect(failures).toEqual([]);
  });
});

describe('formatDuration and formatSetTotal', () => {
  it.each([
    [1, '0:01'],
    [59, '0:59'],
    [60, '1:00'],
    [599, '9:59'],
    [600, '10:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3661, '1:01:01'],
    [36000, '10:00:00'],
    [209.6, '3:30'],
  ])('shows %d seconds as %s', (seconds, shown) => {
    expect(formatDuration(seconds)).toBe(shown);
  });

  it('shows an empty set as 0:00 and a real total as a clock', () => {
    expect(formatSetTotal(0)).toBe('0:00');
    expect(formatSetTotal(1860)).toBe('31:00');
    expect(formatSetTotal(3725)).toBe('1:02:05');
  });
});

describe('resolveItemDuration: every combination of where a length can come from', () => {
  // 7 values in each of 3 places: 343 combinations. The first positive, finite
  // number in the order item, file, song wins; nothing else is ever trusted.
  const VALUES = [undefined, null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, 120] as const;
  const usable = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

  it('always takes the first usable value, and never invents one', () => {
    let checked = 0;
    for (const itemSeconds of VALUES) {
      for (const versionSeconds of VALUES) {
        for (const songSeconds of [...VALUES, 200]) {
          const resolved = resolveItemDuration({ itemSeconds, versionSeconds, songSeconds });
          const expected = usable(itemSeconds)
            ? { seconds: itemSeconds, source: 'item' }
            : usable(versionSeconds)
              ? { seconds: versionSeconds, source: 'version' }
              : usable(songSeconds)
                ? { seconds: songSeconds, source: 'song' }
                : { seconds: null, source: null };
          expect(resolved, JSON.stringify({ itemSeconds, versionSeconds, songSeconds })).toEqual(expected);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(7 * 7 * 8);
  });
});

describe('summarizeSetlist at the edges of the slot', () => {
  const song = (seconds: number | null) => ({ itemType: 'song' as const, songSeconds: seconds });

  it.each([
    // [total seconds, fit, line] against a 25 minute slot (1500 seconds)
    [1500, 'on_time', 'Right on 25 minutes.'],
    [1440, 'on_time', 'Right on 25 minutes.'], // exactly a minute under
    [1439, 'under', 'You are 1 minute under 25.'],
    [1560, 'on_time', 'Right on 25 minutes.'], // exactly a minute over
    [1561, 'over', 'You are 1 minute over 25.'],
    [1589, 'over', 'You are 1 minute over 25.'],
    [1590, 'over', 'You are 2 minutes over 25.'], // a minute and a half rounds up
    [1860, 'over', 'You are 6 minutes over 25.'],
    [1200, 'under', 'You are 5 minutes under 25.'],
    [1, 'under', 'You are 25 minutes under 25.'],
  ])('%i seconds reads as %s: %s', (total, fit, line) => {
    const summary = summarizeSetlist([song(total)], 25);
    expect(summary.fit).toBe(fit);
    expect(describeSetlistFit(summary)).toBe(line);
  });

  it('says minute, not minutes, for a one minute slot', () => {
    expect(describeSetlistFit(summarizeSetlist([], 1))).toBe('Nothing in the set yet. You have 1 minute to fill.');
    expect(describeSetlistFit(summarizeSetlist([song(60)], 1))).toBe('Right on 1 minute.');
  });

  it('never calls a partial set on time, whatever the measured part adds up to', () => {
    for (let total = 0; total <= 1560; total += 30) {
      const summary = summarizeSetlist([song(total || null), song(null)], 25);
      expect(summary.fit, `${total}`).not.toBe('on_time');
      expect(describeSetlistFit(summary)).not.toContain('Right on');
    }
  });

  it('still reports a partial set that is already over as over', () => {
    const summary = summarizeSetlist([song(1600), song(null), song(null)], 25);
    expect(summary.fit).toBe('over');
    expect(describeSetlistFit(summary)).toBe('Already 2 minutes over 25, and 2 songs still need a length.');
  });

  it('counts a talk and a break toward the slot, because they use it', () => {
    const summary = summarizeSetlist(
      [song(1380), { itemType: 'talk', itemSeconds: 60 }, { itemType: 'break', itemSeconds: 60 }],
      25
    );
    expect(summary.totalSeconds).toBe(1500);
    expect(summary.fit).toBe('on_time');
  });

  it('holds up for a long festival set', () => {
    const songs = Array.from({ length: 150 }, () => song(240));
    const summary = summarizeSetlist(songs, 600);
    expect(summary.totalSeconds).toBe(36000);
    expect(describeSetlistFit(summary)).toBe('Right on 600 minutes.');
  });
});

describe('which file a set row sends', () => {
  const file = (id: string, label: string | null, createdAt: string | null) => ({ id, label, createdAt });

  it.each([
    ['no files at all', [], null],
    ['a single file', [file('a', 'original', '2026-01-01T00:00:00Z')], 'a'],
    [
      'the Original over a newer radio edit',
      [file('a', 'radio_edit', '2026-03-01T00:00:00Z'), file('b', 'original', '2026-01-01T00:00:00Z')],
      'b',
    ],
    [
      'the newest of two Originals (a re-master replaces the file)',
      [file('a', 'original', '2026-01-01T00:00:00Z'), file('b', 'original', '2026-02-01T00:00:00Z')],
      'b',
    ],
    [
      'the newest file when there is no Original',
      [file('a', 'clean', '2026-01-01T00:00:00Z'), file('b', 'instrumental', '2026-02-01T00:00:00Z')],
      'b',
    ],
    [
      'a dated file over one with no date',
      [file('a', 'clean', null), file('b', 'clean', '2026-01-01T00:00:00Z')],
      'b',
    ],
    [
      'the first listed when nothing is dated',
      [file('a', 'clean', null), file('b', 'clean', null)],
      'a',
    ],
    [
      'an Original over a file with no label',
      [file('a', null, '2026-05-01T00:00:00Z'), file('b', 'original', '2026-01-01T00:00:00Z')],
      'b',
    ],
    [
      'a file with a broken date as the oldest',
      [file('a', 'clean', 'not a date'), file('b', 'clean', '2026-01-01T00:00:00Z')],
      'b',
    ],
  ])('picks %s', (_name, files, expected) => {
    expect(pickDefaultVersion(files)?.id ?? null).toBe(expected);
  });

  const files = [file('orig', 'original', '2026-01-01T00:00:00Z'), file('clean', 'clean', '2026-02-01T00:00:00Z')];

  it('keeps the file a row chose', () => {
    expect(resolveRowVersion('clean', files)).toEqual({ version: files[1], chosen: true });
  });

  it('falls back to the song’s file when the chosen one was deleted or belongs to another song', () => {
    expect(resolveRowVersion('gone', files)).toEqual({ version: files[0], chosen: false });
  });

  it('uses the song’s file when the row chose nothing, and says so', () => {
    expect(resolveRowVersion(null, files)).toEqual({ version: files[0], chosen: false });
    expect(resolveRowVersion(undefined, files)).toEqual({ version: files[0], chosen: false });
    expect(resolveRowVersion('', files)).toEqual({ version: files[0], chosen: false });
  });

  it('has nothing to send for a song with no files', () => {
    expect(resolveRowVersion('clean', [])).toEqual({ version: null, chosen: false });
  });
});

describe('buildPackFileName: the folder a DJ drags into their software', () => {
  it.each([1, 5, 9, 10, 11, 99, 100, 101, 250, 999, 1000])(
    'keeps a %i song set in running order when sorted by name',
    (count) => {
      const names = Array.from({ length: count }, (_, index) =>
        buildPackFileName({ position: index + 1, totalTracks: count, artistName: 'Dorian', songTitle: 'Song' })
      );
      expect([...names].sort()).toEqual(names);
    }
  );

  it.each([
    [1, 9, '01'],
    [9, 99, '09'],
    [7, 100, '007'],
    [100, 100, '100'],
    [42, 1000, '0042'],
    [120, 99, '120'], // a position past the stated total widens to fit
    [2.6, 10, '03'],
    [0, 10, '01'],
    [-4, 10, '01'],
  ])('writes position %d of %d as %s', (position, totalTracks, prefix) => {
    const name = buildPackFileName({ position, totalTracks, artistName: 'Dorian', songTitle: 'Song' });
    expect(name.split(' ')[0]).toBe(prefix);
  });

  it('keeps accented and non-Latin titles as they are', () => {
    expect(buildPackFileName({ position: 1, artistName: 'Asa', songTitle: 'Ìfẹ́', extension: 'mp3' })).toBe(
      '01 Asa - Ìfẹ́.mp3'
    );
    expect(buildPackFileName({ position: 2, artistName: 'Ado', songTitle: 'うっせぇわ' })).toBe('02 Ado - うっせぇわ');
    expect(buildPackFileName({ position: 3, artistName: 'Dorian', songTitle: 'Lagos 🌙' })).toBe(
      '03 Dorian - Lagos 🌙'
    );
  });

  it('turns every character a filesystem refuses into a space', () => {
    const name = buildPackFileName({ position: 1, artistName: 'A/B', songTitle: 'C\\D?E%F*G:H|I"J<K>L' });
    expect(name).toBe('01 A B - C D E F G H I J K L');
    expect(buildPackFileName({ position: 1, artistName: 'Dorian', songTitle: 'Tab\tNew\nLine\u0000' })).toBe(
      '01 Dorian - Tab New Line'
    );
  });

  const bytes = (value: string) => new TextEncoder().encode(value).length;

  it.each([
    ['a long Latin title', 'x'.repeat(400)],
    ['a long accented title', 'é'.repeat(300)],
    ['a long Japanese title', 'あ'.repeat(300)],
    ['a long run of emoji', '🌙'.repeat(200)],
  ])('keeps %s under what a phone can save, and keeps the ending', (_name, songTitle) => {
    const name = buildPackFileName({
      position: 12,
      totalTracks: 40,
      artistName: 'Dorian and the Lagos Nights Orchestra featuring Everybody'.repeat(3),
      songTitle,
      versionLabel: 'instrumental',
      bpm: 102,
      musicalKey: 'F#m',
      extension: 'flac',
    });
    expect(bytes(name)).toBeLessThanOrEqual(200);
    expect(name.startsWith('12 ')).toBe(true);
    expect(name.endsWith(' (Instrumental)[102BPM][F#m].flac')).toBe(true);
    // Never cut through the middle of a character.
    expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(name))).toBe(name);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(name)).toBe(false);
  });

  it('leaves an ordinary name exactly as it was', () => {
    expect(
      buildPackFileName({
        position: 1,
        artistName: 'Dorian',
        songTitle: 'Lagos Nights',
        versionLabel: 'clean',
        bpm: 102,
        musicalKey: 'Am',
        extension: 'mp3',
      })
    ).toBe('01 Dorian - Lagos Nights (Clean)[102BPM][Am].mp3');
  });
});

describe('what a set row may hold', () => {
  const types: SetlistItemType[] = ['song', 'talk', 'interlude', 'break'];

  it.each(types.filter((type) => type !== 'song'))('refuses a %s that carries a song', (itemType) => {
    const result = parseSetlistItemCreate({ itemType, songId: 's1', durationSeconds: 60 });
    expect(result.errors.map((error) => error.message)).toContain('Only a song slot can carry a song.');
  });

  it.each(types.filter((type) => type !== 'song'))('asks how long a %s is', (itemType) => {
    const result = parseSetlistItemCreate({ itemType });
    expect(result.errors[0]).toEqual({
      field: 'durationSeconds',
      message: 'How long is this? Nothing else can tell us.',
    });
  });

  it.each(types.filter((type) => type !== 'song'))('adds a %s with a length', (itemType) => {
    expect(parseSetlistItemCreate({ itemType, durationSeconds: 60 }).errors).toEqual([]);
  });

  it.each([
    [{}, 'Pick a song for this slot.'],
    [{ songId: '' }, 'Pick a song.'],
    [{ songId: 's1', durationSeconds: 0 }, 'Give a length under twenty minutes, like 3:30.'],
    [{ songId: 's1', durationSeconds: 1201 }, 'Give a length under twenty minutes, like 3:30.'],
    [{ songId: 's1', durationSeconds: 3.5 }, 'Give a length under twenty minutes, like 3:30.'],
    [{ songId: 's1', durationSeconds: '210' }, 'Give a length under twenty minutes, like 3:30.'],
    [{ songId: 's1', songVersionId: '' }, 'Pick a version.'],
    [{ songId: 's1', cueNote: 'x'.repeat(401) }, 'That cue note is too long.'],
    [{ itemType: 'encore', songId: 's1' }, 'That is not something a set can contain.'],
  ])('refuses %j: %s', (input, message) => {
    expect(parseSetlistItemCreate(input).errors.map((error) => error.message)).toContain(message);
  });

  it('adds a song with a chosen file, a length and a note', () => {
    expect(
      parseSetlistItemCreate({ songId: ' s1 ', songVersionId: 'v1', durationSeconds: 210, cueNote: '  Cut at 3:00 ' })
    ).toEqual({
      errors: [],
      columns: { item_type: 'song', song_id: 's1', song_version_id: 'v1', duration_seconds: 210, cue_note: 'Cut at 3:00' },
    });
  });

  it.each([
    // [stored type, stored length, change, expected first error or null]
    ['talk', 60, { durationSeconds: null }, 'This talk needs a length.'],
    ['break', 60, { durationSeconds: null }, 'This break needs a length.'],
    ['interlude', 90, { durationSeconds: null }, 'This interlude needs a length.'],
    ['song', null, { itemType: 'break' }, 'This break needs a length.'],
    ['song', 210, { itemType: 'talk' }, null], // it keeps the row's own length
    ['song', null, { itemType: 'break', durationSeconds: 60 }, null],
    ['talk', 60, { cueNote: 'Thank the promoter' }, null],
    ['break', 60, { itemType: 'song' }, 'Pick a song for this slot.'],
    ['break', 60, { itemType: 'song', songId: 's1' }, null],
    ['song', 210, { songId: null }, 'A song slot needs a song.'],
    ['song', 210, { songVersionId: 'v2' }, null],
    ['song', 210, { durationSeconds: null }, null], // a song can borrow a length
    ['song', 210, {}, 'Nothing to save.'],
    ['song', 210, { durationSeconds: 1201 }, 'Give a length under twenty minutes, like 3:30.'],
    ['song', 210, { position: -1 }, 'That is not a place in the set.'],
    ['song', 210, { position: 3 }, null],
  ] as const)('a %s row (length %s) changed with %j: %s', (type, length, change, expected) => {
    const result = parseSetlistItemPatch(change as Record<string, unknown>, type as SetlistItemType, length);
    expect(result.errors[0]?.message ?? null).toBe(expected);
  });

  it('clears the song when a song row becomes a break, so the database never sees both', () => {
    const result = parseSetlistItemPatch({ itemType: 'break', durationSeconds: 60 }, 'song', 210);
    expect(result.columns).toMatchObject({ item_type: 'break', song_id: null, song_version_id: null });
  });

  it('does not ask for a length it cannot check when the stored one was not passed', () => {
    expect(parseSetlistItemPatch({ cueNote: 'x' }, 'break').errors).toEqual([]);
  });
});
