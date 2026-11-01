import { describe, expect, it } from 'vitest';
import { artistHomeId } from './artist-home';

const one = [{ id: 'a1' }];

describe('artistHomeId', () => {
  it('opens the one artist for an artist account', () => {
    expect(artistHomeId({ role: 'artist' }, one)).toBe('a1');
    expect(artistHomeId({ onboarding_persona: 'independent_artist' }, one)).toBe('a1');
  });

  it('keeps the list for anyone who is not the artist', () => {
    expect(artistHomeId({ role: 'artist-manager' }, one)).toBeNull();
    expect(artistHomeId({ onboarding_persona: 'music_manager', role: 'artist' }, one)).toBeNull();
    expect(artistHomeId({ role: 'team-member' }, one)).toBeNull();
    expect(artistHomeId(null, one)).toBeNull();
  });

  it('keeps the list when there is no artist yet or more than one', () => {
    expect(artistHomeId({ role: 'artist' }, [])).toBeNull();
    expect(artistHomeId({ role: 'artist' }, [{ id: 'a1' }, { id: 'a2' }])).toBeNull();
  });

  it('follows a saved view override', () => {
    expect(artistHomeId({ role: 'manager', role_view: 'solo_artist' }, one)).toBe('a1');
    expect(artistHomeId({ role: 'artist', role_view: 'label' }, one)).toBeNull();
  });
});
