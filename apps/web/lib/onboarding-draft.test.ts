import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_ONBOARDING_DRAFT,
  MAX_ONBOARDING_ARTIST_NAME_LENGTH,
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraft,
} from './onboarding-draft';

function install() {
  const map = new Map<string, string>();
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    },
  });
  return map;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const full: OnboardingDraft = {
  releaseType: 'single',
  whereStuck: ['marketing_promo'],
  stage: 'date_set',
  title: 'Love Me JeJe',
  releaseDate: '2026-12-04',
  artistName: 'Tems',
  planningPreference: 'ai_recommendations',
};

describe('the onboarding draft', () => {
  it('starts with no artist name', () => {
    expect(EMPTY_ONBOARDING_DRAFT.artistName).toBe('');
  });

  it('round-trips the artist name with everything else', () => {
    install();
    saveOnboardingDraft(full);
    expect(loadOnboardingDraft()).toEqual(full);
  });

  it('reads an older draft with no artist name as an empty one', () => {
    const map = install();
    const { artistName: _artistName, ...older } = full;
    map.set('urganize.onboarding.draft', JSON.stringify(older));
    expect(loadOnboardingDraft().artistName).toBe('');
    expect(loadOnboardingDraft().title).toBe('Love Me JeJe');
  });

  it('refuses a non-string artist name and caps a long one', () => {
    const map = install();
    map.set('urganize.onboarding.draft', JSON.stringify({ ...full, artistName: 42 }));
    expect(loadOnboardingDraft().artistName).toBe('');
    map.set('urganize.onboarding.draft', JSON.stringify({ ...full, artistName: 'x'.repeat(500) }));
    expect(loadOnboardingDraft().artistName).toHaveLength(MAX_ONBOARDING_ARTIST_NAME_LENGTH);
  });

  it('uses the same ceiling as the other artist fields', () => {
    expect(MAX_ONBOARDING_ARTIST_NAME_LENGTH).toBe(120);
  });

  it('clears', () => {
    install();
    saveOnboardingDraft(full);
    clearOnboardingDraft();
    expect(loadOnboardingDraft()).toEqual(EMPTY_ONBOARDING_DRAFT);
  });
});
