import { afterEach, describe, expect, it, vi } from 'vitest';
import { describePostHogKeyProblem } from './shared';

// The first tests in lib/analytics/. They exist because of a real incident
// (2026-09-03): NEXT_PUBLIC_POSTHOG_KEY was set to a PERSONAL API key (phx_)
// rather than the project key (phc_), so posthog-js's /array/<token>/config
// request 404'd and the SDK never initialised — and, far worse, a secret was
// compiled into the public client bundle and served to every visitor.

const PROJECT_KEY = 'phc_LjipqZRB75aiheptwwq9M2LAjinwUbKmaum';
const PERSONAL_KEY = 'phx_LjipqZRB75aiheptwwq9M2LAjinwUbKmaum';

describe('describePostHogKeyProblem', () => {
  it('accepts a project key with no complaint', () => {
    expect(describePostHogKeyProblem(PROJECT_KEY)).toBeNull();
  });

  it('says nothing about an absent key — the missing-config path already covers it', () => {
    expect(describePostHogKeyProblem('')).toBeNull();
    expect(describePostHogKeyProblem('   ')).toBeNull();
  });

  it('REFUSES a personal API key, and says why in words somebody can act on', () => {
    const problem = describePostHogKeyProblem(PERSONAL_KEY);
    expect(problem).not.toBeNull();
    if (!problem) return;
    expect(problem.fatal).toBe(true);
    expect(problem.message.toLowerCase()).toContain('personal');
    expect(problem.message.toLowerCase()).toContain('revoke');
  });

  it('NEVER puts the key in the message — a warning that leaks the secret is worse than none', () => {
    const problem = describePostHogKeyProblem(PERSONAL_KEY);
    expect(problem?.message).not.toContain(PERSONAL_KEY);
    // Not even the distinctive tail of it.
    expect(problem?.message).not.toContain('LjipqZRB75');
  });

  it('warns about an unrecognised prefix but does NOT refuse it', () => {
    // Blocking everything unknown would silently kill analytics the day
    // PostHog adds a new valid prefix. Only the known-secret one is fatal.
    const problem = describePostHogKeyProblem('phz_somethingnew');
    expect(problem).not.toBeNull();
    expect(problem?.fatal).toBe(false);
  });

  it('is case-insensitive about the personal-key prefix', () => {
    expect(describePostHogKeyProblem('PHX_abcdef')?.fatal).toBe(true);
  });
});

describe('getPostHogProjectKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function load() {
    vi.resetModules();
    return import('./shared');
  }

  it('returns a project key untouched', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', PROJECT_KEY);
    expect((await load()).getPostHogProjectKey()).toBe(PROJECT_KEY);
  });

  it('returns EMPTY for a personal key, so no secret is ever sent to PostHog', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', PERSONAL_KEY);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await load()).getPostHogProjectKey()).toBe('');
    expect(error).toHaveBeenCalled();
  });

  it('still honours the PROJECT_TOKEN fallback name', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', PROJECT_KEY);
    expect((await load()).getPostHogProjectKey()).toBe(PROJECT_KEY);
  });

  it('refuses a personal key supplied under the fallback name too', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', PERSONAL_KEY);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await load()).getPostHogProjectKey()).toBe('');
  });

  it('returns empty when nothing is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', '');
    expect((await load()).getPostHogProjectKey()).toBe('');
  });
});
