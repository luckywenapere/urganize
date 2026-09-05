import { describe, expect, it } from 'vitest';
import { isPubliclyReadable, personSubtitle } from './person-public';

describe('public readability', () => {
  it('opens the page only for a public profile', () => {
    expect(isPubliclyReadable('public')).toBe(true);
  });

  it('does NOT open the page for a directory profile', () => {
    // The one somebody would "fix" by mistake. Directory means findable by
    // signed-in users, not readable by the open web.
    expect(isPubliclyReadable('directory')).toBe(false);
  });

  it('does not open the page for a private profile', () => {
    expect(isPubliclyReadable('private')).toBe(false);
  });
});

describe('subtitle', () => {
  it('joins a place', () => {
    expect(personSubtitle({ city: 'Lagos', country: 'Nigeria' })).toBe('Lagos, Nigeria');
  });

  it('says nothing when there is nothing to say', () => {
    expect(personSubtitle({ city: null, country: null })).toBe('');
    expect(personSubtitle({ city: '  ', country: null })).toBe('');
  });

  it('drops the missing half rather than leaving a comma', () => {
    expect(personSubtitle({ city: 'Lagos', country: null })).toBe('Lagos');
    expect(personSubtitle({ city: null, country: 'Nigeria' })).toBe('Nigeria');
  });
});
