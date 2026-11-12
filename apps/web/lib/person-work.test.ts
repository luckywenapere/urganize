import { describe, expect, it } from 'vitest';
import { isRolloutPublic, workPieces, worksWith, type WorkRecord } from './person-work';

const TODAY = '2026-11-12';

function record(over: Partial<WorkRecord> & { releaseId: string }): WorkRecord {
  return {
    role: 'graphic_designer',
    releaseTitle: 'Ohema',
    artistName: 'Kemi Adeyemi',
    releaseDate: '2026-11-02',
    isTest: false,
    ...over,
  };
}

describe('a rollout is public once it is out (#1221)', () => {
  it('counts today and earlier as out', () => {
    expect(isRolloutPublic('2026-11-12', TODAY)).toBe(true);
    expect(isRolloutPublic('2026-01-01', TODAY)).toBe(true);
  });

  it('a future or missing date is private', () => {
    expect(isRolloutPublic('2026-11-13', TODAY)).toBe(false);
    expect(isRolloutPublic(null, TODAY)).toBe(false);
    expect(isRolloutPublic('', TODAY)).toBe(false);
  });
});

describe('work on Urganize', () => {
  it('names a public rollout with its artist and date', () => {
    const [piece] = workPieces([record({ releaseId: 'r1' })], TODAY);
    expect(piece).toEqual({
      key: 'r1:graphic_designer',
      work: 'Cover art',
      title: 'Ohema',
      artistName: 'Kemi Adeyemi',
      outOn: '2026-11-02',
    });
  });

  it('counts a private rollout without its name, artist or date', () => {
    const [piece] = workPieces([record({ releaseId: 'r2', releaseDate: '2026-12-20', releaseTitle: 'Secret' })], TODAY);
    expect(piece).toEqual({ key: 'r2:graphic_designer', work: 'Cover art', title: null, artistName: null, outOn: null });
  });

  it('leaves out test rollouts and repeats', () => {
    const pieces = workPieces(
      [record({ releaseId: 'r1' }), record({ releaseId: 'r1' }), record({ releaseId: 'r9', isTest: true })],
      TODAY
    );
    expect(pieces.map((piece) => piece.key)).toEqual(['r1:graphic_designer']);
  });

  it('puts the newest public work first and private work last', () => {
    const pieces = workPieces(
      [
        record({ releaseId: 'old', releaseDate: '2026-09-18', releaseTitle: 'Lagos Nights' }),
        record({ releaseId: 'soon', releaseDate: '2027-01-01' }),
        record({ releaseId: 'new', releaseDate: '2026-11-02' }),
      ],
      TODAY
    );
    expect(pieces.map((piece) => piece.key.split(':')[0])).toEqual(['new', 'old', 'soon']);
  });

  it('a blank title stays unnamed even when out', () => {
    const [piece] = workPieces([record({ releaseId: 'r1', releaseTitle: '  ' })], TODAY);
    expect(piece.title).toBeNull();
  });
});

describe('works with', () => {
  it('lists managed artists first, then artists from public work, each once', () => {
    const pieces = workPieces(
      [
        record({ releaseId: 'a', artistName: 'Tolu Williams' }),
        record({ releaseId: 'b', artistName: 'Kemi Adeyemi' }),
        record({ releaseId: 'c', artistName: 'Hidden Artist', releaseDate: '2027-02-01' }),
      ],
      TODAY
    );
    expect(worksWith(['Kemi Adeyemi', 'Ada Kalu'], pieces)).toEqual(['Kemi Adeyemi', 'Ada Kalu', 'Tolu Williams']);
  });

  it('drops blank names', () => {
    expect(worksWith(['', '  '], [])).toEqual([]);
  });
});
