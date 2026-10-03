import { describe, expect, it } from 'vitest';
import { resolvePerson, type MatchContext } from './person-match';

const ctx = (over: Partial<MatchContext> = {}): MatchContext => ({
  byIdentifier: new Map(),
  teamContacts: [],
  ...over,
});

const input = (over: Partial<Parameters<typeof resolvePerson>[0]> = {}) => ({
  label: 'Tunde Okafor',
  role: 'producer',
  identifiers: [] as Array<{ kind: 'email' | 'phone'; value: string }>,
  ...over,
});

describe('resolvePerson: email, then phone', () => {
  it('matches on email', () => {
    const result = resolvePerson(
      input({ identifiers: [{ kind: 'email', value: 't@x.com' }] }),
      ctx({ byIdentifier: new Map([['email:t@x.com', 'p1']]) })
    );
    expect(result).toEqual({ kind: 'match', personId: 'p1', via: 'email', alsoMatched: [] });
  });

  it('matches on phone when there is no email match', () => {
    const result = resolvePerson(
      input({ identifiers: [{ kind: 'phone', value: '+2348031234567' }] }),
      ctx({ byIdentifier: new Map([['phone:+2348031234567', 'p2']]) })
    );
    expect(result).toMatchObject({ kind: 'match', personId: 'p2', via: 'phone' });
  });

  it('prefers the email match, and reports a different phone match so it can be flagged', () => {
    const result = resolvePerson(
      input({
        identifiers: [
          { kind: 'email', value: 't@x.com' },
          { kind: 'phone', value: '+2348031234567' },
        ],
      }),
      ctx({
        byIdentifier: new Map([
          ['email:t@x.com', 'p1'],
          ['phone:+2348031234567', 'p2'],
        ]),
      })
    );
    expect(result).toEqual({ kind: 'match', personId: 'p1', via: 'email', alsoMatched: ['p2'] });
  });

  it('does not report the same person twice when both identifiers agree', () => {
    const result = resolvePerson(
      input({
        identifiers: [
          { kind: 'email', value: 't@x.com' },
          { kind: 'phone', value: '+2348031234567' },
        ],
      }),
      ctx({
        byIdentifier: new Map([
          ['email:t@x.com', 'p1'],
          ['phone:+2348031234567', 'p1'],
        ]),
      })
    );
    expect(result).toMatchObject({ personId: 'p1', alsoMatched: [] });
  });
});

describe('resolvePerson: names never merge people on their own', () => {
  const contact = (over = {}) => ({ personId: 'p9', label: 'Tunde Okafor', role: 'producer', ...over });

  it('reuses one of the team’s own contacts with the same name AND role', () => {
    const result = resolvePerson(input(), ctx({ teamContacts: [contact()] }));
    expect(result).toMatchObject({ kind: 'match', personId: 'p9', via: 'name_and_role' });
  });

  it('compares names loosely: case, spacing and accents do not matter', () => {
    const result = resolvePerson(
      input({ label: '  tunde   OKAFOR ' }),
      ctx({ teamContacts: [contact({ label: 'Tunde Okafor' })] })
    );
    expect(result).toMatchObject({ kind: 'match', personId: 'p9' });
  });

  it('creates a NEW person and flags the old one when only the name matches', () => {
    const result = resolvePerson(input({ role: 'videographer' }), ctx({ teamContacts: [contact()] }));
    expect(result).toEqual({ kind: 'create', possibleDuplicates: [{ personId: 'p9', reason: 'same_name' }] });
  });

  it('creates a new person with no flags when nothing resembles them', () => {
    expect(resolvePerson(input(), ctx({ teamContacts: [contact({ label: 'Someone Else' })] }))).toEqual({
      kind: 'create',
      possibleDuplicates: [],
    });
  });

  it('an identifier match wins over a name match', () => {
    const result = resolvePerson(
      input({ identifiers: [{ kind: 'email', value: 't@x.com' }] }),
      ctx({ byIdentifier: new Map([['email:t@x.com', 'p1']]), teamContacts: [contact()] })
    );
    expect(result).toMatchObject({ kind: 'match', personId: 'p1', via: 'email' });
  });

  it('never treats an empty name as a match', () => {
    const result = resolvePerson(input({ label: '' }), ctx({ teamContacts: [contact({ label: '' })] }));
    expect(result).toMatchObject({ kind: 'create' });
  });

  it('flags every same-name contact, not just the first', () => {
    const result = resolvePerson(
      input({ role: 'dj' }),
      ctx({ teamContacts: [contact({ personId: 'a' }), contact({ personId: 'b', role: 'editor' })] })
    );
    expect(result).toMatchObject({
      kind: 'create',
      possibleDuplicates: [
        { personId: 'a', reason: 'same_name' },
        { personId: 'b', reason: 'same_name' },
      ],
    });
  });
});
