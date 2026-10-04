import { describe, expect, it } from 'vitest';
import { firstContactEmail, formatKitDate, kitTextFile } from './press-kit-text';

describe('formatKitDate', () => {
  it('writes a plain date out in words', () => {
    expect(formatKitDate('2026-10-23')).toBe('23 Oct 2026');
    expect(formatKitDate('2026-01-05T10:00:00Z')).toBe('5 Jan 2026');
  });
  it('leaves anything else alone', () => {
    expect(formatKitDate('Summer 2026')).toBe('Summer 2026');
    expect(formatKitDate('2026-02-31')).toBe('2026-02-31');
    expect(formatKitDate('2026-13-01')).toBe('2026-13-01');
    expect(formatKitDate(undefined)).toBe('');
    expect(formatKitDate(5)).toBe('');
  });
});

describe('firstContactEmail', () => {
  it('skips contacts with no usable address', () => {
    expect(
      firstContactEmail({ contacts: [{ name: 'A' }, { email: 'nope' }, { email: ' ada@x.com ' }] })
    ).toBe('ada@x.com');
  });
  it('answers empty for nothing', () => {
    expect(firstContactEmail(undefined)).toBe('');
    expect(firstContactEmail({ contacts: 'x' })).toBe('');
    expect(firstContactEmail({ contacts: [{ email: 'a@b.com, c@d.com' }] })).toBe('');
  });
});

describe('kitTextFile', () => {
  it('includes only what the kit holds', () => {
    const text = kitTextFile({
      artistName: 'Dorian',
      header: { descriptor: 'Afrobeats singer', homeCity: 'Lagos' },
      bios: { medium: 'He sings.' },
      contact: { contacts: [{ name: 'Ada', role: 'Manager', email: 'ada@x.com' }] },
      links: { links: [{ label: 'https://open.spotify.com/artist/1', url: '' }] },
    });
    expect(text).toContain('Dorian\nAfrobeats singer\nLagos');
    expect(text).toContain('Bio\nHe sings.');
    expect(text).toContain('Ada (Manager) ada@x.com');
    expect(text).toContain('Spotify: https://open.spotify.com/artist/1');
    expect(text).not.toContain('Short bio');
    expect(text).not.toContain('—');
  });
  it('still works with an empty kit', () => {
    expect(kitTextFile({ artistName: '', header: {}, bios: {}, contact: {}, links: {} })).toBe('Press kit\n');
  });
});
