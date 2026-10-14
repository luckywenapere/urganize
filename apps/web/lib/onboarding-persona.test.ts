import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_PERSONA_CHOICES,
  ONBOARDING_PERSONA_LABELS,
  deriveOnboardingRoleFromPersona,
  isOnboardingPersona,
  nextProfileRoleForPersona,
  profileRoleForPersona,
} from './onboarding';
import { normalizeAppRole } from './role-permissions';

// URG-262: the "Who are you?" answers and the account role each one gives.

describe('the persona answers', () => {
  it('offers the five answers the founder asked for, in order', () => {
    expect(ONBOARDING_PERSONA_CHOICES.map((persona) => ONBOARDING_PERSONA_LABELS[persona])).toEqual([
      'Artist manager',
      'Label',
      'Solo artist',
      'Artist team',
      'Other',
    ]);
  });

  it('accepts every offered answer, and still reads the retired producer one', () => {
    for (const persona of ONBOARDING_PERSONA_CHOICES) expect(isOnboardingPersona(persona)).toBe(true);
    expect(isOnboardingPersona('producer_beatmaker')).toBe(true);
    expect(isOnboardingPersona('label')).toBe(false);
  });

  it('fills the legacy onboarding_role for every answer', () => {
    for (const persona of ONBOARDING_PERSONA_CHOICES) {
      expect(deriveOnboardingRoleFromPersona(persona)).not.toBeNull();
    }
  });
});

describe('the account role a persona gives', () => {
  it('maps each answer to a role profiles_role_check allows', () => {
    expect(profileRoleForPersona('independent_artist')).toBe('artist');
    expect(profileRoleForPersona('music_manager')).toBe('artist-manager');
    expect(profileRoleForPersona('label_ar')).toBe('manager');
    expect(profileRoleForPersona('artist_team')).toBe('artist-manager');
    expect(profileRoleForPersona('other')).toBeNull();
    expect(profileRoleForPersona(null)).toBeNull();
  });

  it('keeps every self-serve team owner able to run their own team', () => {
    // 'artist-team' is the invitee role and normalizes to team-member, which
    // cannot create plans; no persona may give it.
    for (const persona of ['music_manager', 'label_ar', 'artist_team'] as const) {
      expect(normalizeAppRole(profileRoleForPersona(persona))).toBe('manager');
    }
    expect(normalizeAppRole(profileRoleForPersona('independent_artist'))).toBe('artist');
  });

  it('replaces the Google fallback with the answer', () => {
    expect(nextProfileRoleForPersona('artist-manager', 'independent_artist')).toBe('artist');
    expect(nextProfileRoleForPersona('artist-manager', 'label_ar')).toBe('manager');
    expect(nextProfileRoleForPersona(null, 'label_ar')).toBe('manager');
  });

  it('writes nothing when the role already matches or the answer maps to none', () => {
    expect(nextProfileRoleForPersona('artist-manager', 'music_manager')).toBeNull();
    expect(nextProfileRoleForPersona('artist-manager', 'other')).toBeNull();
  });

  it('never overwrites a role an invite gave, or a curator', () => {
    for (const role of ['artist-team', 'team-member', 'viewer', 'curator']) {
      expect(nextProfileRoleForPersona(role, 'independent_artist')).toBeNull();
      expect(nextProfileRoleForPersona(role, 'label_ar')).toBeNull();
    }
  });
});
