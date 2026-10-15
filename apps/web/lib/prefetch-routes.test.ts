import { afterEach, describe, expect, it, vi } from 'vitest';

// prefetch-routes reads its feature flags at MODULE scope (the NEXT_PUBLIC_*
// inlining pattern), so stubbing env after an import would be too late — each
// case re-imports the module with the flags it wants. Every flag is stubbed
// explicitly rather than read from the ambient environment: vitest does not
// load .env.local, and leaving any of them to chance would make these
// assertions depend on whoever ran them.
async function loadRoutes(options: {
  notes: boolean;
  events: boolean;
  pitching: boolean;
  home?: boolean;
}) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_FEATURE_NOTES', options.notes ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_EVENTS', options.events ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCHING', options.pitching ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_HOME', options.home ? 'true' : 'false');
  return import('./prefetch-routes');
}

const ALL_ON = { notes: true, events: true, pitching: true, home: true };
const ALL_OFF = { notes: false, events: false, pitching: false, home: false };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildPrefetchRoutes', () => {
  it('always warms the two destinations every account has', async () => {
    const { buildPrefetchRoutes } = await loadRoutes(ALL_OFF);
    expect(buildPrefetchRoutes({ hasCuratorProfile: false })).toEqual([
      '/dashboard',
      '/dashboard/urgans',
      '/dashboard/home',
      '/dashboard/opportunities',
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
      '/dashboard/home',
      '/dashboard/notes',
      '/dashboard/opportunities',
      '/curator',
    ]);
  });

  // The newest landing destination: the same bug this module exists for,
  // caught before it could happen this time — /dashboard/home is warmed the
  // moment its own flag is on, with no dependency on any of the others.
  it('warms the Home tab when its flag is on, and nothing else has to be', async () => {
    const { buildPrefetchRoutes } = await loadRoutes({
      notes: false,
      events: false,
      pitching: false,
      home: true,
    });
    expect(buildPrefetchRoutes({ hasCuratorProfile: false })).toContain('/dashboard/home');
  });

  // Pitching left the nav (2026-10-15) and lives inside each rollout, so its
  // old page (now a bridge) is never warmed, and an account with no playlists
  // gets no curator crossing either.
  it('never warms the old pitching page, now a bridge into a rollout', async () => {
    const { buildPrefetchRoutes } = await loadRoutes(ALL_ON);
    const routes = buildPrefetchRoutes({ hasCuratorProfile: false });
    expect(routes).not.toContain('/dashboard/pitching');
    expect(routes).not.toContain('/curator');
  });

  // Press kits left the nav on 2026-09-09 (founder call) and is reached from
  // Settings, which is already a base route. Warming the page would spend
  // bytes on a destination no menu offers.
  it('never warms the press kits page, whatever the flags say', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_NOTES', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_EVENTS', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCHING', 'true');
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PRESS_KITS', 'true');
    const { buildPrefetchRoutes } = await import('./prefetch-routes');
    expect(buildPrefetchRoutes({ hasCuratorProfile: true })).not.toContain(
      '/dashboard/press-kits'
    );
  });

  it('leaves a flagged-off route out — with the flag off it bounces or 404s', async () => {
    const { buildPrefetchRoutes } = await loadRoutes({
      notes: false,
      events: true,
      pitching: false,
    });
    const routes = buildPrefetchRoutes({ hasCuratorProfile: true });
    // Shows left the nav (URG-303); its old link still opens, unwarmed.
    expect(routes).not.toContain('/dashboard/shows');
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
    expect(routes.slice(0, 2)).toEqual(['/dashboard', '/dashboard/urgans']);
    // Settings is a pop-up now; /settings is a redirect stub and worth no bytes.
    expect(routes).not.toContain('/settings');
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
