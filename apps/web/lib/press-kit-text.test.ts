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

describe('date edge cases', () => {
  it('handles leap days correctly', () => {
    expect(formatKitDate('2028-02-29')).toBe('29 Feb 2028');
    expect(formatKitDate('2027-02-29')).toBe('2027-02-29');
  });
  it('trims and rejects partial dates', () => {
    expect(formatKitDate('  2026-10-23 ')).toBe('23 Oct 2026');
    expect(formatKitDate('2026-10')).toBe('2026-10');
    expect(formatKitDate('23/10/2026')).toBe('23/10/2026');
    expect(formatKitDate('')).toBe('');
    expect(formatKitDate(null)).toBe('');
  });
  it('does not shift a date across a zone', () => {
    expect(formatKitDate('2026-12-31T23:30:00-05:00')).toBe('31 Dec 2026');
  });
});

describe('email edge cases', () => {
  it('rejects spaces, angle brackets and lists', () => {
    for (const bad of ['a b@c.com', '<a@b.com>', 'a@b', 'a@@b.com', '@b.com', 'a@b.', 'a@b.com;c@d.com']) {
      expect(firstContactEmail({ contacts: [{ email: bad }] })).toBe('');
    }
  });
  it('accepts plus addressing and subdomains', () => {
    expect(firstContactEmail({ contacts: [{ email: 'ada+press@mail.example.co.uk' }] })).toBe('ada+press@mail.example.co.uk');
  });
});

describe('kitTextFile edge cases', () => {
  const base = { header: {}, bios: {}, contact: {}, links: {} };
  it('skips links that cannot be resolved', () => {
    const text = kitTextFile({ ...base, artistName: 'A', links: { links: [{ label: 'x', url: 'javascript:alert(1)' }] } });
    expect(text).not.toContain('Links');
    expect(text).not.toContain('javascript');
  });
  it('ends with exactly one newline and never contains an em dash', () => {
    const text = kitTextFile({ ...base, artistName: 'A', bios: { short: 'x' } });
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });
  it('keeps multi-paragraph bios intact', () => {
    expect(kitTextFile({ ...base, artistName: 'A', bios: { long: 'One.\n\nTwo.' } })).toContain('One.\n\nTwo.');
  });
  it('lists a contact with only an email or only a name', () => {
    const text = kitTextFile({ ...base, artistName: 'A', contact: { contacts: [{ email: 'a@b.com' }, { name: 'Ada' }, {}] } });
    expect(text).toContain('a@b.com');
    expect(text).toContain('Ada');
  });
  it('ignores non-string values everywhere', () => {
    expect(() => kitTextFile({ artistName: 'A', header: { descriptor: 5 }, bios: { short: {} }, contact: { contacts: 'x' }, links: { links: 7 } })).not.toThrow();
  });
});
