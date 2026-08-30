import { describe, expect, it } from 'vitest';
import {
  ON_TIME_TOLERANCE_SECONDS,
  buildPackFileName,
  describeSetlistFit,
  formatDuration,
  resolveItemDuration,
  summarizeSetlist,
  type SetlistSummaryItem,
} from './setlist';

const song = (seconds: number | null): SetlistSummaryItem => ({ songSeconds: seconds });

describe('resolveItemDuration', () => {
  // Precedence is deliberate: the most specific answer wins. A radio edit
  // really is shorter than the extended mix, so the version beats the song.
  it('prefers the item override, then the version, then the song', () => {
    expect(resolveItemDuration({ itemSeconds: 10, versionSeconds: 20, songSeconds: 30 })).toEqual({
      seconds: 10,
      source: 'item',
    });
    expect(resolveItemDuration({ versionSeconds: 20, songSeconds: 30 })).toEqual({
      seconds: 20,
      source: 'version',
    });
    expect(resolveItemDuration({ songSeconds: 30 })).toEqual({ seconds: 30, source: 'song' });
  });

  // THE load-bearing property. Returning 0 here would silently shorten every
  // set containing an unmeasured song, which is the exact failure the events
  // feature exists to prevent.
  it('returns null, never zero, when nothing is known', () => {
    expect(resolveItemDuration({})).toEqual({ seconds: null, source: null });
    expect(resolveItemDuration({ songSeconds: null }).seconds).toBeNull();
  });

  it('ignores zero, negative and non-finite values rather than trusting them', () => {
    expect(resolveItemDuration({ itemSeconds: 0, songSeconds: 30 }).source).toBe('song');
    expect(resolveItemDuration({ itemSeconds: -5, songSeconds: 30 }).source).toBe('song');
    expect(resolveItemDuration({ itemSeconds: Number.NaN, songSeconds: 30 }).source).toBe('song');
    expect(resolveItemDuration({ songSeconds: Number.POSITIVE_INFINITY }).seconds).toBeNull();
  });
});

describe('summarizeSetlist', () => {
  // Verbatim from the spec's acceptance criteria: "Given a setlist of nine
  // songs totalling 31 minutes and a set length of 25, when the manager opens
  // the setlist, then the total shows red and reads 6 minutes over."
  it('reads nine songs totalling 31 minutes against a 25 minute slot as 6 over', () => {
    const items = [
      song(210), song(205), song(215), song(200), song(190),
      song(220), song(205), song(200), song(215),
    ];
    const total = items.reduce((sum, item) => sum + (item.songSeconds ?? 0), 0);
    expect(total).toBe(1860); // 31 minutes exactly

    const summary = summarizeSetlist(items, 25);
    expect(summary.totalSeconds).toBe(1860);
    expect(summary.fit).toBe('over');
    expect(summary.deltaSeconds).toBe(360);
    expect(describeSetlistFit(summary)).toBe('You are 6 minutes over 25.');
  });

  // "Given a song with no duration on file, when it is added to a setlist,
  // then the item prompts for a duration and does not count as zero."
  it('counts an unmeasured item as unknown rather than as zero', () => {
    const summary = summarizeSetlist([song(600), song(null)], 25);
    expect(summary.totalSeconds).toBe(600);
    expect(summary.unmeasuredCount).toBe(1);
    expect(summary.isPartial).toBe(true);
    expect(describeSetlistFit(summary)).toBe('one item needs a length before this total means anything.');
  });

  // The asymmetry that makes this module trustworthy: it may say "over"
  // without full information, because unknowns can only push a set longer.
  it('still reports over when the measured part alone busts the slot', () => {
    const summary = summarizeSetlist([song(1800), song(null)], 25);
    expect(summary.fit).toBe('over');
    expect(describeSetlistFit(summary)).toBe('Already 5 minutes over 25, and 1 still need a length.');
  });

  // ...and the mirror image, which is the one that would get an artist cut off
  // on stage. A partial set must NEVER read as on time or comfortably under.
  it('never reports on_time while anything is unmeasured', () => {
    const summary = summarizeSetlist([song(1500), song(null)], 25);
    expect(summary.deltaSeconds).toBe(0); // measured part is exactly the slot
    expect(summary.fit).not.toBe('on_time');
    expect(summary.fit).toBe('under');
  });

  it('reports on_time only when everything is known and inside the tolerance', () => {
    expect(summarizeSetlist([song(1500)], 25).fit).toBe('on_time');
    expect(summarizeSetlist([song(1500 + ON_TIME_TOLERANCE_SECONDS)], 25).fit).toBe('on_time');
    expect(summarizeSetlist([song(1500 + ON_TIME_TOLERANCE_SECONDS + 1)], 25).fit).toBe('over');
    expect(summarizeSetlist([song(1500 - ON_TIME_TOLERANCE_SECONDS - 1)], 25).fit).toBe('under');
  });

  // Non-song items are in the model precisely so they count.
  it('counts talk and interlude items toward the total', () => {
    // 24 minutes of music fits a 25 minute slot on its own. Three minutes of
    // talking is what busts it — which is the entire reason non-song items
    // carry durations.
    const musicOnly = summarizeSetlist([song(1440)], 25);
    expect(musicOnly.fit).toBe('on_time');

    const withTalk = summarizeSetlist([song(1440), { itemType: 'talk', itemSeconds: 180 }], 25);
    expect(withTalk.totalSeconds).toBe(1620);
    expect(withTalk.fit).toBe('over');
  });

  it('handles an empty setlist and a nonsense slot without throwing', () => {
    expect(summarizeSetlist([], 25).totalSeconds).toBe(0);
    expect(summarizeSetlist([], 25).fit).toBe('under');
    expect(summarizeSetlist([song(60)], 0).slotSeconds).toBe(0);
    expect(summarizeSetlist([song(60)], Number.NaN).slotSeconds).toBe(0);
  });
});

describe('describeSetlistFit', () => {
  it('never rounds a real overrun down to zero minutes', () => {
    const summary = summarizeSetlist([song(1500 + 70)], 25); // 70s over
    expect(describeSetlistFit(summary)).toBe('You are 1 minute over 25.');
  });

  it('says minute, not minutes, for one', () => {
    expect(describeSetlistFit(summarizeSetlist([song(1500 - 90)], 25))).toContain('2 minutes under');
    expect(describeSetlistFit(summarizeSetlist([song(1500 + 70)], 25))).toContain('1 minute over');
  });

  it('pluralises the unmeasured count', () => {
    const two = summarizeSetlist([song(null), song(null)], 25);
    expect(describeSetlistFit(two)).toBe('2 items need a length before this total means anything.');
  });
});

describe('formatDuration', () => {
  it('renders clock time', () => {
    expect(formatDuration(214)).toBe('3:34');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(3860)).toBe('1:04:20');
  });

  it('renders an em dash for anything unusable rather than 0:00', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
  });
});

describe('buildPackFileName', () => {
  // The spec's example, verbatim.
  it('builds the documented name', () => {
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

  // The leading number is the whole point — it is what makes the folder land
  // in set order in Rekordbox. Zero-padded so 10 does not sort before 2.
  it('zero-pads the set position so it sorts correctly', () => {
    const names = [2, 10].map((position) =>
      buildPackFileName({ position, artistName: 'A', songTitle: 'T', extension: 'mp3' })
    );
    expect(names).toEqual(['02 A - T.mp3', '10 A - T.mp3']);
    expect([...names].sort()).toEqual(names);
  });

  it('omits unknown parts instead of rendering empty brackets', () => {
    expect(
      buildPackFileName({ position: 3, artistName: 'Dorian', songTitle: 'Lagos Nights', extension: 'wav' })
    ).toBe('03 Dorian - Lagos Nights.wav');
  });

  it('strips characters that would break a filesystem or a zip tool', () => {
    const name = buildPackFileName({
      position: 4,
      artistName: 'A/B',
      songTitle: 'Who? *Now*: "Live"',
      extension: 'mp3',
    });
    // Stripped characters collapse into single spaces and the result is
    // trimmed, so a title full of punctuation still reads as a title rather
    // than as a gappy mess in a dark DJ booth.
    expect(name).toBe('04 A B - Who Now Live.mp3');
    expect(name).not.toMatch(/[/\\?%*:|"<>]/);
    expect(name).not.toMatch(/ {2}/);
  });

  it('survives blank names rather than producing a nameless file', () => {
    expect(buildPackFileName({ position: 1, artistName: '   ', songTitle: '', extension: 'mp3' })).toBe(
      '01 Unknown artist - Untitled.mp3'
    );
  });

  it('tolerates a missing or dotted extension', () => {
    expect(buildPackFileName({ position: 1, artistName: 'A', songTitle: 'T' })).toBe('01 A - T');
    expect(buildPackFileName({ position: 1, artistName: 'A', songTitle: 'T', extension: '.MP3' })).toBe(
      '01 A - T.mp3'
    );
  });
});
