import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_ONBOARDING_DRAFT,
  MAX_ONBOARDING_ARTIST_NAME_LENGTH,
  clearOnboardingDraft,
  hasWorkingOnAnswer,
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
  persona: 'label_ar',
  releaseType: 'single',
  whereStuck: ['marketing_promo'],
  readyToday: ['master', 'artwork', 'distributor'],
  stage: 'date_set',
  title: 'Love Me JeJe',
  releaseDate: '2026-12-04',
  artistName: 'Tems',
  planningPreference: 'ai_recommendations',
  nothingPlanned: false,
  heardFrom: 'instagram',
};

describe('"Nothing planned yet" (2026-10-24)', () => {
  it('starts off, survives a reload, and never sits beside a release type', () => {
    expect(EMPTY_ONBOARDING_DRAFT.nothingPlanned).toBe(false);
    install();
    saveOnboardingDraft({ ...EMPTY_ONBOARDING_DRAFT, nothingPlanned: true });
    expect(loadOnboardingDraft().nothingPlanned).toBe(true);
    saveOnboardingDraft({ ...full, nothingPlanned: true });
    expect(loadOnboardingDraft().nothingPlanned).toBe(false);
  });

  it('answers step 0 on its own', () => {
    const available = (type: OnboardingDraft['releaseType']) => type === 'single';
    expect(hasWorkingOnAnswer({ releaseType: null, nothingPlanned: true }, available)).toBe(true);
    expect(hasWorkingOnAnswer({ releaseType: null, nothingPlanned: false }, available)).toBe(false);
    expect(hasWorkingOnAnswer({ releaseType: 'single', nothingPlanned: false }, available)).toBe(true);
    expect(hasWorkingOnAnswer({ releaseType: 'music_video', nothingPlanned: false }, available)).toBe(false);
  });
});

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

  it('keeps the persona answer across a reload (the Google round trip)', () => {
    install();
    saveOnboardingDraft(full);
    expect(loadOnboardingDraft().persona).toBe('label_ar');
  });

  it('reads a missing or unknown persona as unanswered', () => {
    const map = install();
    const { persona: _persona, ...older } = full;
    map.set('urganize.onboarding.draft', JSON.stringify(older));
    expect(loadOnboardingDraft().persona).toBeNull();
    map.set('urganize.onboarding.draft', JSON.stringify({ ...full, persona: 'astronaut' }));
    expect(loadOnboardingDraft().persona).toBeNull();
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
