import { describe, expect, it } from 'vitest';
import { firstContactEmail, withContactEmail } from './release-kit-publish-server';

// The About {artist} row in Pitch this! (Oct 17, 2026) sets the first
// contact's email on the artist kit.
describe('withContactEmail', () => {
  it('adds a contact when there is none', () => {
    expect(withContactEmail({}, ' a@b.co ')).toEqual({ contacts: [{ name: '', role: '', email: 'a@b.co' }] });
  });

  it('changes only the first contact and keeps the rest', () => {
    const before = { contacts: [{ name: 'Ada', role: 'Manager', email: 'old@b.co' }, { name: 'Bo', role: '', email: 'bo@b.co' }], note: 'x' };
    const after = withContactEmail(before, 'new@b.co');
    expect(after).toEqual({ ...before, contacts: [{ name: 'Ada', role: 'Manager', email: 'new@b.co' }, before.contacts[1]] });
    expect(firstContactEmail(after)).toBe('new@b.co');
  });

  it('clearing drops a contact that holds nothing else, and keeps a named one', () => {
    expect(withContactEmail({ contacts: [{ name: '', role: '', email: 'a@b.co' }] }, '')).toEqual({ contacts: [] });
    expect(withContactEmail({ contacts: [{ name: 'Ada', role: '', email: 'a@b.co' }] }, '')).toEqual({
      contacts: [{ name: 'Ada', role: '', email: '' }],
    });
  });
});
