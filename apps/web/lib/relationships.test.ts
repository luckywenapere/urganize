import { describe, expect, it } from 'vitest';
import {
  MAX_NOTES,
  MAX_TAGS,
  orderPair,
  parseInteraction,
  parseRelationshipCreate,
  parseRelationshipPatch,
} from './relationships';

describe('parseRelationshipCreate', () => {
  it('needs a name and nothing else', () => {
    const result = parseRelationshipCreate({ label: '  Tunde Okafor ' });
    expect(result).toEqual({
      value: {
        label: 'Tunde Okafor',
        role: '',
        company: '',
        email: null,
        phone: null,
        tags: [],
        notes: '',
        rateNote: null,
        lastContactAt: null,
      },
    });
  });

  it('refuses a missing or blank name, and one that is too long', () => {
    expect('error' in parseRelationshipCreate({})).toBe(true);
    expect('error' in parseRelationshipCreate({ label: '   ' })).toBe(true);
    expect('error' in parseRelationshipCreate({ label: 'x'.repeat(81) })).toBe(true);
  });

  it('refuses an email or phone that is not usable, rather than quietly dropping it', () => {
    const bad = parseRelationshipCreate({ label: 'A', email: 'nope' });
    expect('error' in bad && bad.error).toMatch(/email/i);
    const badPhone = parseRelationshipCreate({ label: 'A', phone: '123' });
    expect('error' in badPhone && badPhone.error).toMatch(/phone/i);
  });

  it('keeps the normalised email and phone', () => {
    const result = parseRelationshipCreate({ label: 'A', email: ' T@X.com ', phone: '0803 123 4567' });
    expect(result).toMatchObject({ value: { email: 't@x.com', phone: '+2348031234567' } });
  });

  it('cleans tags: lowercase, trimmed, no duplicates, no blanks', () => {
    const result = parseRelationshipCreate({ label: 'A', tags: [' Video ', 'video', '', 'Lagos'] });
    expect(result).toMatchObject({ value: { tags: ['video', 'lagos'] } });
  });

  it('refuses too many tags and over-long notes', () => {
    const many = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`);
    expect('error' in parseRelationshipCreate({ label: 'A', tags: many })).toBe(true);
    expect('error' in parseRelationshipCreate({ label: 'A', notes: 'x'.repeat(MAX_NOTES + 1) })).toBe(true);
  });
});

describe('parseRelationshipPatch', () => {
  it('leaves absent fields out, so an edit to one never wipes another', () => {
    expect(parseRelationshipPatch({ role: 'director' })).toEqual({ value: { role: 'director' } });
  });

  it('treats an explicit null as clearing, and absent as untouched', () => {
    expect(parseRelationshipPatch({ rateNote: null, lastContactAt: null })).toEqual({
      value: { rateNote: null, lastContactAt: null },
    });
  });

  it('refuses an empty edit', () => {
    expect('error' in parseRelationshipPatch({})).toBe(true);
  });

  it('refuses a blank name but lets notes be emptied', () => {
    expect('error' in parseRelationshipPatch({ label: ' ' })).toBe(true);
    expect(parseRelationshipPatch({ notes: '' })).toEqual({ value: { notes: '' } });
  });

  it('accepts a real date for last contact and refuses junk', () => {
    expect(parseRelationshipPatch({ lastContactAt: '2026-09-30' })).toEqual({
      value: { lastContactAt: '2026-09-30T00:00:00.000Z' },
    });
    expect('error' in parseRelationshipPatch({ lastContactAt: 'yesterday' })).toBe(true);
  });
});

describe('orderPair', () => {
  it('puts the smaller id first whichever way round they arrive', () => {
    expect(orderPair('b', 'a')).toEqual(['a', 'b']);
    expect(orderPair('a', 'b')).toEqual(['a', 'b']);
  });

  it('compares ids without regard to case, as the database stores them', () => {
    expect(orderPair('B1', 'a1')).toEqual(['a1', 'b1']);
  });
});

describe('My People fields (URG-306)', () => {
  it('reads a company on create and on edit', () => {
    const created = parseRelationshipCreate({ label: 'Amaka Obi', company: '  Eko Sound ' });
    expect('value' in created && created.value.company).toBe('Eko Sound');
    expect(parseRelationshipPatch({ company: 'x'.repeat(61) })).toHaveProperty('error');
  });

  it('edits the team’s own email and phone, empty clears, unreadable is an error', () => {
    expect(parseRelationshipPatch({ email: 'A@B.co', phone: '' })).toEqual({ value: { email: 'a@b.co', phone: null } });
    expect(parseRelationshipPatch({ email: 'nope' })).toHaveProperty('error');
  });

  it('takes one short line for the log', () => {
    expect(parseInteraction({ body: '  Sent   EP link ' })).toEqual({ value: { body: 'Sent EP link' } });
    expect(parseInteraction({ body: '   ' })).toHaveProperty('error');
    expect(parseInteraction({ body: 'x'.repeat(201) })).toHaveProperty('error');
  });
});
