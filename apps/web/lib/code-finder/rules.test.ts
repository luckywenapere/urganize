import { describe, expect, it } from 'vitest';
import {
  artistScore,
  candidateKey,
  dateScore,
  decideMatch,
  isLookupDue,
  isOutOn,
  LOOKUP_RETRY_MS,
  normalizeName,
  parseMatchPick,
  pickOutNow,
  scoreCandidate,
  titleScore,
  type CodeCandidate,
  type CodeTarget,
} from './rules';

const target: CodeTarget = { title: 'Ohema', artistName: 'Dorian', releaseDate: '2026-11-06', releaseType: 'single' };

function candidate(over: Partial<CodeCandidate> & { id: string }): CodeCandidate {
  return {
    source: 'deezer',
    kind: 'track',
    title: 'Ohema',
    artist: 'Dorian',
    releaseDate: '2026-11-06',
    upc: '123456789012',
    isrc: 'NGABC2600001',
    coverUrl: null,
    url: null,
    ...over,
  };
}

// 2026-11-06 at 10:00 Lagos.
const NOW = Date.parse('2026-11-06T09:00:00Z');

describe('names', () => {
  it('drops features, versions, "- Single" and punctuation', () => {
    expect(normalizeName('Ohema (feat. Tems)')).toBe('ohema');
    expect(normalizeName('Ohema - Single')).toBe('ohema');
    expect(normalizeName('Ọhẹma!')).toBe('ohema');
    expect(normalizeName('Love & Light')).toBe('love and light');
  });

  it('scores a title that holds ours lower than an exact one', () => {
    expect(titleScore('Ohema', 'Ohema')).toBe(1);
    expect(titleScore('Ohema', 'Ohema Pt. 2')).toBe(0.8);
    expect(titleScore('Ohema', 'Something else')).toBe(0);
  });

  it('finds our artist among several', () => {
    expect(artistScore('Dorian', 'Dorian, Tems')).toBe(1);
    expect(artistScore('Dorian', 'Tems & Dorian')).toBe(1);
    expect(artistScore('Dorian', 'Dorian feat. Tems')).toBe(1);
    expect(artistScore('Dorian', 'Tems')).toBe(0);
  });

  it('scores dates by distance, with an unknown date in the middle', () => {
    expect(dateScore('2026-11-06', '2026-11-07')).toBe(1);
    expect(dateScore('2026-11-06', '2026-11-12')).toBe(0.6);
    expect(dateScore('2026-11-06', '2025-01-01')).toBe(0);
    expect(dateScore('2026-11-06', null)).toBe(0.4);
  });
});

describe('scoring', () => {
  it('never lets a wrong artist pass, however good the title', () => {
    expect(scoreCandidate(target, candidate({ id: '1', artist: 'Someone Else' }))).toBeLessThan(0.6);
  });

  it('prefers a track for a single and an album for an EP', () => {
    const track = candidate({ id: '1', kind: 'track' });
    const album = candidate({ id: '2', kind: 'album' });
    expect(scoreCandidate(target, track)).toBeGreaterThan(scoreCandidate(target, album));
    const ep = { ...target, releaseType: 'ep' };
    expect(scoreCandidate(ep, album)).toBeGreaterThan(scoreCandidate(ep, track));
  });
});

describe('decideMatch', () => {
  it('finds nothing in an empty list', () => {
    expect(decideMatch(target, [])).toEqual({ kind: 'none' });
  });

  it('ignores a result with no valid code', () => {
    expect(decideMatch(target, [candidate({ id: '1', upc: null, isrc: 'nope' })])).toEqual({ kind: 'none' });
  });

  it('takes a lone good result as clear', () => {
    const decision = decideMatch(target, [candidate({ id: '1' })]);
    expect(decision.kind).toBe('clear');
  });

  it('treats two listings with the same code as one song', () => {
    const decision = decideMatch(target, [candidate({ id: '1' }), candidate({ id: '2', source: 'spotify' })]);
    expect(decision.kind).toBe('clear');
  });

  it('asks AI to choose between two equally good results with different codes', () => {
    const decision = decideMatch(target, [
      candidate({ id: '1' }),
      candidate({ id: '2', upc: '999999999999', isrc: 'NGXYZ2600009' }),
    ]);
    expect(decision.kind).toBe('ambiguous');
    if (decision.kind === 'ambiguous') expect(decision.options).toHaveLength(2);
  });

  it('skips a result the person already said is not theirs', () => {
    const first = candidate({ id: '1' });
    const second = candidate({ id: '2', releaseDate: '2026-11-20', upc: '999999999999', isrc: 'NGXYZ2600009' });
    const decision = decideMatch(target, [first, second], [candidateKey(first)]);
    expect(decision.kind).toBe('clear');
    if (decision.kind === 'clear') expect(decision.best.candidate.id).toBe('2');
  });

  it('chooses on its own when one result is far ahead', () => {
    const decision = decideMatch(target, [
      candidate({ id: '1' }),
      candidate({ id: '2', title: 'Ohema Pt. 2', releaseDate: '2025-01-01', kind: 'album', upc: '999999999999', isrc: null }),
    ]);
    expect(decision.kind).toBe('clear');
    if (decision.kind === 'clear') expect(decision.best.candidate.id).toBe('1');
  });
});

describe('looking again', () => {
  it('looks when it has never looked', () => {
    expect(isLookupDue(null, NOW)).toBe(true);
  });

  it('never looks again while a result waits for an answer, or after one is confirmed', () => {
    expect(isLookupDue({ status: 'found', checkedAt: new Date(NOW - 10 * LOOKUP_RETRY_MS).toISOString() }, NOW)).toBe(false);
    expect(isLookupDue({ status: 'confirmed', checkedAt: null }, NOW)).toBe(false);
  });

  it('waits 15 minutes after finding nothing', () => {
    const recent = new Date(NOW - LOOKUP_RETRY_MS + 1000).toISOString();
    const old = new Date(NOW - LOOKUP_RETRY_MS).toISOString();
    expect(isLookupDue({ status: 'not_found', checkedAt: recent }, NOW)).toBe(false);
    expect(isLookupDue({ status: 'not_found', checkedAt: old }, NOW)).toBe(true);
  });

  it('looks straight away after a "not my song"', () => {
    expect(isLookupDue({ status: 'rejected', checkedAt: null }, NOW)).toBe(true);
  });

  it('knows a song is out from release day in Lagos', () => {
    expect(isOutOn('2026-11-06', NOW)).toBe(true);
    expect(isOutOn('2026-11-07', NOW)).toBe(false);
    expect(isOutOn(null, NOW)).toBe(false);
  });
});

describe('the AI pick', () => {
  it('accepts a number in the list, or null', () => {
    expect(parseMatchPick('{"pick":1}', 2)).toEqual({ pick: 1 });
    expect(parseMatchPick('{"pick":null}', 2)).toEqual({ pick: null });
  });

  it('refuses anything outside the list it was given', () => {
    expect(parseMatchPick('{"pick":2}', 2)).toBeNull();
    expect(parseMatchPick('{"pick":-1}', 2)).toBeNull();
    expect(parseMatchPick('{"pick":"0"}', 2)).toBeNull();
    expect(parseMatchPick('not json', 2)).toBeNull();
  });
});

describe('out now on Home', () => {
  const rows = [
    { id: 'today', releaseDate: '2026-11-06' },
    { id: 'six-days', releaseDate: '2026-10-31' },
    { id: 'seven-days', releaseDate: '2026-10-30' },
    { id: 'tomorrow', releaseDate: '2026-11-07' },
    { id: 'no-date', releaseDate: null },
    { id: 'test', releaseDate: '2026-11-05', metadata: { test_release: true } },
    { id: 'archived', releaseDate: '2026-11-05', status: 'archived' },
  ];

  it('keeps release day and the six days after it, newest first', () => {
    expect(pickOutNow(rows, NOW).map((r) => r.id)).toEqual(['today', 'six-days']);
  });
});
