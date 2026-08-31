import { afterEach, describe, expect, it, vi } from 'vitest';

// prefetch-routes reads its feature flags at MODULE scope (the NEXT_PUBLIC_*
// inlining pattern), so stubbing env after an import would be too late — each
// case re-imports the module with the flags it wants. Every flag is stubbed
// explicitly rather than read from the ambient environment: vitest does not
// load .env.local, and leaving any of them to chance would make these
// assertions depend on whoever ran them.
async function loadRoutes(options: { notes: boolean; events: boolean; pitching: boolean }) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_FEATURE_NOTES', options.notes ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_EVENTS', options.events ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCHING', options.pitching ? 'true' : 'false');
  return import('./prefetch-routes');
}

const ALL_ON = { notes: true, events: true, pitching: true };
const ALL_OFF = { notes: false, events: false, pitching: false };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildPrefetchRoutes', () => {
  it('always warms the three destinations every account has', async () => {
    const { buildPrefetchRoutes } = await loadRoutes(ALL_OFF);
    expect(buildPrefetchRoutes({ hasCuratorProfile: false })).toEqual([
      '/dashboard',
      '/dashboard/urgans',
      '/settings',
    ]);
  });

  // The bug this module exists for: the list sat at three entries while the
  // nav grew Notes, Shows and the curator crossing, so those were cold on
  // every load.
  it('warms every nav destination when the flags are on', async () => {
    const { buildPrefetchRoutes } = await loadRoutes(ALL_ON);
    expect(buildPrefetchRoutes({ hasCuratorProfile: true })).toEqual([
      '/dashboard',
      '/dashboard/urgans',
      '/settings',
      '/dashboard/notes',
      '/dashboard/shows',
      '/curator',
    ]);
  });

  it('leaves a flagged-off route out — with the flag off it bounces or 404s', async () => {
    const { buildPrefetchRoutes } = await loadRoutes({
      notes: false,
      events: true,
      pitching: false,
    });
    const routes = buildPrefetchRoutes({ hasCuratorProfile: true });
    expect(routes).toContain('/dashboard/shows');
    expect(routes).not.toContain('/dashboard/notes');
    expect(routes).not.toContain('/curator');
  });

  it('needs BOTH the pitching flag and a real curator profile for the crossing', async () => {
    const { buildPrefetchRoutes } = await loadRoutes(ALL_ON);
    expect(buildPrefetchRoutes({ hasCuratorProfile: false })).not.toContain('/curator');

    const { buildPrefetchRoutes: flagOff } = await loadRoutes({
      notes: true,
      events: true,
      pitching: false,
    });
    expect(flagOff({ hasCuratorProfile: true })).not.toContain('/curator');
  });

  // The dual-account tri-state trap, with a cheaper consequence than usual:
  // null means "the probe has not answered", so the crossing is left unwarmed
  // until it does rather than being decided against.
  it('treats an unresolved curator probe as not-yet, never as no', async () => {
    const { buildPrefetchRoutes } = await loadRoutes(ALL_ON);
    expect(buildPrefetchRoutes({ hasCuratorProfile: null })).not.toContain('/curator');
    // ...and the answer arriving adds it, which is what makes re-running safe.
    expect(buildPrefetchRoutes({ hasCuratorProfile: true })).toContain('/curator');
  });

  it('puts the shared destinations first, so a dying link warms those', async () => {
    const { buildPrefetchRoutes } = await loadRoutes(ALL_ON);
    const routes = buildPrefetchRoutes({ hasCuratorProfile: true });
    expect(routes.slice(0, 3)).toEqual(['/dashboard', '/dashboard/urgans', '/settings']);
  });

  it('never returns a duplicate, so no chunk is asked for twice', async () => {
    const { buildPrefetchRoutes } = await loadRoutes(ALL_ON);
    const routes = buildPrefetchRoutes({ hasCuratorProfile: true });
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('returns a fresh array, so a caller cannot mutate the shared base list', async () => {
    const { buildPrefetchRoutes } = await loadRoutes(ALL_OFF);
    const first = buildPrefetchRoutes({ hasCuratorProfile: false });
    first.push('/mutated');
    expect(buildPrefetchRoutes({ hasCuratorProfile: false })).not.toContain('/mutated');
  });
});
