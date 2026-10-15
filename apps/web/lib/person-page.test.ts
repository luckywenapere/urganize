import { describe, expect, it } from 'vitest';
import {
  CREDIT_TILES_SHOWN,
  MANAGED_FACES_SHOWN,
  displayLink,
  hypeLine,
  initialsOf,
  pickCreditTiles,
  pickManagedFaces,
  roleLine,
  shareCardPath,
} from './person-page';

describe('hypeLine', () => {
  it('is the first non-empty line, or nothing', () => {
    expect(hypeLine('\n  Two bedroom acts to a sold-out O2. \nMore')).toBe('Two bedroom acts to a sold-out O2.');
    expect(hypeLine('')).toBeNull();
    expect(hypeLine(null)).toBeNull();
    expect(hypeLine('   \n ')).toBeNull();
  });
  it('is capped', () => {
    const line = hypeLine('x'.repeat(200))!;
    expect(line.length).toBe(90);
    expect(line.endsWith('…')).toBe(true);
  });
});

describe('roleLine', () => {
  it('leads with a proven role, then the city', () => {
    expect(
      roleLine({
        roles: [
          { role: 'producer', delivered: 0 },
          { role: 'manager', delivered: 3 },
        ] as never,
        profileType: null,
        city: 'Lagos',
      })
    ).toBe('Manager · Lagos');
  });
  it('falls back to the type, and drops what is missing', () => {
    expect(roleLine({ roles: [], profileType: 'artist', city: '' })).toBe('Artist');
    expect(roleLine({ roles: [], profileType: null, city: 'Abuja' })).toBe('Abuja');
    expect(roleLine({ roles: [], profileType: null, city: null })).toBeNull();
  });
});

describe('pickManagedFaces', () => {
  it('drops unnamed rows, puts photos first and caps', () => {
    const rows = [
      { id: 'a', name: 'A', photoPath: null },
      { id: 'b', name: '  ', photoPath: 'x' },
      { id: 'c', name: 'C', photoPath: 'c.jpg' },
      { id: 'd', name: 'D', photoPath: null },
      { id: 'e', name: 'E', photoPath: null },
      { id: 'f', name: 'F', photoPath: null },
    ];
    const picked = pickManagedFaces(rows).map((row) => row.id);
    expect(picked).toEqual(['c', 'a', 'd', 'e']);
    expect(picked.length).toBe(MANAGED_FACES_SHOWN);
  });
});

describe('pickCreditTiles', () => {
  it('only artwork, newest first, capped', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      artworkAssetId: i === 3 ? null : `art${i}`,
      releaseDate: `2025-01-${String(i + 1).padStart(2, '0')}`,
    }));
    const picked = pickCreditTiles(rows);
    expect(picked.length).toBe(CREDIT_TILES_SHOWN);
    expect(picked[0].id).toBe('11');
    expect(picked.some((row) => row.id === '3')).toBe(false);
  });
});

describe('small helpers', () => {
  it('initials, card path and the printed link', () => {
    expect(initialsOf('Tobi Adeyemi')).toBe('TA');
    expect(initialsOf('Wizkid')).toBe('W');
    expect(shareCardPath('tobi')).toBe('/p/tobi/card');
    expect(displayLink('https://app.urganize.app/p/tobi/')).toBe('app.urganize.app/p/tobi');
    expect(displayLink('https://www.example.com/p/x')).toBe('example.com/p/x');
  });
});
