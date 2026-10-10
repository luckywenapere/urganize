import { describe, expect, it } from 'vitest';
import {
  slugConflictIsOurs,
  PERSON_BIO_MAX_CHARS,
  PERSON_LINKS_MAX,
  PERSON_ROLES_MAX,
  isListed,
  parsePersonProfileInput,
  profileRoles,
  suggestSlug,
} from './person-profile';

/**
 * What a person is allowed to say about themselves, and what the product says
 * about them instead.
 *
 * The split matters: everything parsed here is self-reported and therefore
 * shaped and capped, while the delivered counts folded in by profileRoles come
 * from delivery records and are never touched by any of it.
 */

describe('person profile input', () => {
  it('accepts a plain opt in', () => {
    const parsed = parsePersonProfileInput({ displayName: 'Ada Obi', visibility: 'directory' });
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.input.displayName).toBe('Ada Obi');
    expect(parsed.input.visibility).toBe('directory');
  });

  it('trims a padded display name and refuses an empty one', () => {
    const padded = parsePersonProfileInput({ displayName: '  Ada  ' });
    expect('error' in padded).toBe(false);
    if (!('error' in padded)) expect(padded.input.displayName).toBe('Ada');

    expect(parsePersonProfileInput({ displayName: '   ' })).toHaveProperty('error');
  });

  it('leaves an omitted field alone rather than blanking it', () => {
    // The editor autosaves one field at a time, so a sparse body must be a
    // sparse update. Treating absent as null would wipe a bio the moment
    // somebody edited their city.
    const parsed = parsePersonProfileInput({ city: 'Lagos' });
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.input).toEqual({ city: 'Lagos' });
    expect('bio' in parsed.input).toBe(false);
  });

  it('reads an explicit null as clearing the field', () => {
    const parsed = parsePersonProfileInput({ bio: null });
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.input.bio).toBeNull();
  });

  it('refuses a role outside the vocabulary', () => {
    expect(parsePersonProfileInput({ roles: ['vibes_manager'] })).toHaveProperty('error');
  });

  it('drops a duplicate role rather than refusing the save', () => {
    const parsed = parsePersonProfileInput({ roles: ['pr', 'pr', 'producer'] });
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.input.roles).toEqual(['pr', 'producer']);
  });

  it('caps the number of roles', () => {
    const tooMany = Array.from({ length: PERSON_ROLES_MAX + 1 }, () => 'pr');
    // Deduplication happens first, so a cap has to be tested with real values.
    const parsed = parsePersonProfileInput({
      roles: ['manager', 'a_and_r', 'producer', 'mix_engineer', 'master_engineer', 'songwriter', 'pr'].slice(
        0,
        PERSON_ROLES_MAX + 1
      ),
    });
    expect(tooMany.length).toBeGreaterThan(PERSON_ROLES_MAX);
    expect(parsed).toHaveProperty('error');
  });

  it('refuses an over-long bio', () => {
    expect(parsePersonProfileInput({ bio: 'a'.repeat(PERSON_BIO_MAX_CHARS + 1) })).toHaveProperty(
      'error'
    );
  });

  it('refuses a link that is not http or https', () => {
    // A javascript: url on a page other people open is the one input here that
    // could hurt somebody rather than just look wrong.
    expect(
      parsePersonProfileInput({ links: [{ label: 'Site', url: 'javascript:alert(1)' }] })
    ).toHaveProperty('error');
    expect(
      parsePersonProfileInput({ links: [{ label: 'Site', url: 'data:text/html,x' }] })
    ).toHaveProperty('error');
  });

  it('accepts a well formed link and caps the list', () => {
    const ok = parsePersonProfileInput({ links: [{ label: 'Site', url: 'https://ada.example' }] });
    expect('error' in ok).toBe(false);

    const tooMany = Array.from({ length: PERSON_LINKS_MAX + 1 }, (_, i) => ({
      label: `L${i}`,
      url: 'https://ada.example',
    }));
    expect(parsePersonProfileInput({ links: tooMany })).toHaveProperty('error');
  });

  it('refuses an unknown visibility or availability', () => {
    expect(parsePersonProfileInput({ visibility: 'everyone' })).toHaveProperty('error');
    expect(parsePersonProfileInput({ availability: 'maybe' })).toHaveProperty('error');
  });
});

describe('slug suggestion', () => {
  it('turns a name into a handle', () => {
    expect(suggestSlug('Ada Obi')).toBe('ada-obi');
    expect(suggestSlug("Ada  O'Brien-Smith")).toBe('ada-obrien-smith');
  });

  it('answers null when nothing usable survives', () => {
    expect(suggestSlug('!!!')).toBeNull();
    expect(suggestSlug('')).toBeNull();
    expect(suggestSlug('a')).toBeNull();
  });
});

describe('listing', () => {
  it('counts only a profile that opted in', () => {
    expect(isListed('private')).toBe(false);
    expect(isListed('directory')).toBe(true);
    expect(isListed('public')).toBe(true);
  });
});

describe('profile roles', () => {
  it('folds delivered counts into the claimed roles', () => {
    const roles = profileRoles(['pr', 'producer'], [
      { role: 'pr' },
      { role: 'pr' },
    ]);
    expect(roles).toEqual([
      { role: 'pr', delivered: 2 },
      { role: 'producer', delivered: 0 },
    ]);
  });

  it('shows a delivered role the person never claimed', () => {
    // The record is the point. Somebody who delivered artwork and never
    // thought to tick "graphic designer" should still show it, and hiding it
    // would make the count depend on self-reporting again.
    const roles = profileRoles([], [{ role: 'graphic_designer' }]);
    expect(roles).toEqual([{ role: 'graphic_designer', delivered: 1 }]);
  });

  it('puts delivered roles first, then claimed, each alphabetical', () => {
    const roles = profileRoles(['manager', 'a_and_r'], [{ role: 'pr' }]);
    expect(roles.map((entry) => entry.role)).toEqual(['pr', 'a_and_r', 'manager']);
  });
});

describe('slugConflictIsOurs', () => {
  it('is true when the handle was suggested on a first save', () => {
    // The user typed a name and pressed "List me". There is no handle field on
    // screen at that point, so telling them "that handle is taken" names a
    // thing they never chose and cannot change — a dead end on the one action
    // the whole feature depends on.
    expect(slugConflictIsOurs({ displayName: 'Ada Obi', visibility: 'directory' }, false)).toBe(true);
  });

  it('is false when the user supplied the handle', () => {
    expect(slugConflictIsOurs({ slug: 'ada-obi' }, false)).toBe(false);
  });

  it('is false when the profile already existed', () => {
    // Nothing auto-suggests on an update, so a collision there can only be one
    // the user asked for.
    expect(slugConflictIsOurs({ displayName: 'Ada Obi' }, true)).toBe(false);
  });

  it('is false when the user deliberately cleared the handle', () => {
    // An explicit null is a choice, and it cannot collide anyway.
    expect(slugConflictIsOurs({ slug: null }, false)).toBe(false);
  });
});

describe('profile type input', () => {
  it('accepts a known type and lets null clear the override', () => {
    expect(parsePersonProfileInput({ profileType: 'artist' })).toEqual({
      input: { profileType: 'artist' },
    });
    expect(parsePersonProfileInput({ profileType: null })).toEqual({
      input: { profileType: null },
    });
  });

  it('refuses a type it does not know', () => {
    expect(parsePersonProfileInput({ profileType: 'wizard' })).toEqual({
      error: 'Pick one of the profile types.',
    });
  });

  it('leaves the override alone when the key is absent', () => {
    expect(parsePersonProfileInput({ city: 'Lagos' })).toEqual({ input: { city: 'Lagos' } });
  });
});
