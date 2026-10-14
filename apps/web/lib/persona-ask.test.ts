import { afterEach, describe, expect, it, vi } from 'vitest';
import { markPersonaAskSettled, needsPersonaAnswer, readPersonaAskSettled } from './persona-ask';

function install(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    },
  });
  return map;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('who gets the one-time persona ask', () => {
  it('asks an account with no answer', () => {
    expect(needsPersonaAnswer({ id: 'u1', role: 'artist-manager', onboarding_persona: null })).toBe(true);
  });

  it('does not ask an account that answered', () => {
    expect(needsPersonaAnswer({ id: 'u1', role: 'artist', onboarding_persona: 'independent_artist' })).toBe(false);
    expect(needsPersonaAnswer({ id: 'u1', role: 'manager', onboarding_persona: 'artist_team' })).toBe(false);
  });

  it('treats a value it does not know as no answer', () => {
    expect(needsPersonaAnswer({ id: 'u1', role: 'artist', onboarding_persona: 'astronaut' })).toBe(true);
  });

  it('never asks a curator-only account, or nobody', () => {
    expect(needsPersonaAnswer({ id: 'u1', role: 'curator', onboarding_persona: null })).toBe(false);
    expect(needsPersonaAnswer(null)).toBe(false);
    expect(needsPersonaAnswer({ id: null, role: 'artist' })).toBe(false);
  });
});

describe('asking once per device', () => {
  it('is unsettled until answered or closed, per account', () => {
    install();
    expect(readPersonaAskSettled('u1')).toBe(false);
    markPersonaAskSettled('u1', 'closed');
    expect(readPersonaAskSettled('u1')).toBe(true);
    expect(readPersonaAskSettled('u2')).toBe(false);
  });

  it('fails closed when storage cannot be read', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(readPersonaAskSettled('u1')).toBe(true);
    expect(() => markPersonaAskSettled('u1', 'answered')).not.toThrow();
  });
});
