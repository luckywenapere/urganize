import { afterEach, describe, expect, it, vi } from 'vitest';

// Opportunities and Relationships were paused Oct 27, 2026 (founder call).
// Both must read OFF with the production environment as it stood that day
// (NEXT_PUBLIC_FEATURE_RELATIONSHIPS=true, nothing else set), and each comes
// back only through its own new env var.
describe('paused features', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const load = async () => import('./paused-features');

  it('keeps both off with the environment production had when they were paused', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELATIONSHIPS', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_OPPORTUNITIES', '');
    vi.stubEnv('NEXT_PUBLIC_RELATIONSHIPS_UNPAUSED', '');
    const flags = await load();
    expect(flags.OPPORTUNITIES_ENABLED).toBe(false);
    expect(flags.RELATIONSHIPS_ENABLED).toBe(false);
    expect(flags.isOpportunitiesEnabled()).toBe(false);
    expect(flags.isRelationshipsFlagOn()).toBe(false);
  });

  it('brings Opportunities back only with its own var set to "true"', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_OPPORTUNITIES', 'true');
    expect((await load()).OPPORTUNITIES_ENABLED).toBe(true);
  });

  it('brings Relationships back only with the unpause var AND its old flag', async () => {
    vi.stubEnv('NEXT_PUBLIC_RELATIONSHIPS_UNPAUSED', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELATIONSHIPS', 'false');
    expect((await load()).isRelationshipsFlagOn()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_RELATIONSHIPS', 'true');
    expect((await load()).isRelationshipsFlagOn()).toBe(true);
  });
});
