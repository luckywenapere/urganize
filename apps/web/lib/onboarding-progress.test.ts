import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_ALMOST_THERE_AFTER_MS,
  ONBOARDING_PROGRESS_NOTE,
  inviteStepButtonLabels,
  onboardingProgressMessage,
} from './onboarding-progress';

describe('onboarding progress copy', () => {
  it('names each stage, with the rollout by its title', () => {
    expect(onboardingProgressMessage('account', 'Love Me JeJe')).toBe('Creating your account…');
    expect(onboardingProgressMessage('rollout', 'Love Me JeJe')).toBe('Setting up “Love Me JeJe”…');
    expect(onboardingProgressMessage('almost', 'Love Me JeJe')).toBe('Almost there…');
  });

  it('falls back when there is no title, and shortens a very long one', () => {
    expect(onboardingProgressMessage('rollout', '   ')).toBe('Setting up your first rollout…');
    const long = onboardingProgressMessage('rollout', 'a'.repeat(200));
    expect(long.length).toBeLessThan(80);
    expect(long.endsWith('…”…')).toBe(true);
  });

  it('says how long it takes, and moves on before it looks frozen', () => {
    expect(ONBOARDING_PROGRESS_NOTE).toBe('This takes under a minute.');
    expect(ONBOARDING_ALMOST_THERE_AFTER_MS).toBeLessThanOrEqual(10_000);
  });
});

describe('invite step buttons', () => {
  it('Skip says Continuing, Send says Sending, never each other’s word', () => {
    expect(inviteStepButtonLabels(null)).toEqual({ send: 'Send invites & continue', skip: 'Skip for now' });
    expect(inviteStepButtonLabels('skip')).toEqual({ send: 'Send invites & continue', skip: 'Continuing…' });
    expect(inviteStepButtonLabels('send')).toEqual({ send: 'Sending…', skip: 'Skip for now' });
  });
});
