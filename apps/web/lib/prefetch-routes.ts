import { isOpportunitiesEnabled, isRelationshipsFlagOn } from '@/lib/paused-features';
// Which route chunks to warm in the background so a tap is instant.
//
// These pages are thin server wrappers over big client components, so what a
// prefetch buys is the JS chunk landing in cache before the click — on a slow
// link that is the whole difference between an instant switch and a skeleton.
// It matters most right after a reload, when every chunk is cold again.
//
// NOT "the entire app", deliberately. Prefetching is a straight trade: bytes
// now for latency later, and this product's users are largely on metered
// Nigerian mobile data (the reasoning in lib/connection.ts, which gates this
// list off entirely on Data Saver and 2g). So the rule is "every destination
// the primary nav offers, and nothing else":
//
//   - Public token pages (/epk, /credits, /capture, /pack) are for strangers
//     who arrive with a link. A signed-in user never taps through to one.
//   - The money and identity flows (/locked, /start-trial, /payment, /redeem,
//     /oauth/authorize, /invite, /join) are one-time or exceptional. Warming
//     them speculatively spends bytes on pages most users never see once.
//   - /admin is internal and reachable by a couple of accounts. It is one more
//     entry for almost nobody, so it stays off the list.
//   - The redirect stubs (/dashboard/releases, /dashboard/tasks,
//     /dashboard/chappi) resolve to routes already on the list.
//
// This list has to keep pace with the nav, which is the mistake it was written
// to fix: it sat at three entries while the identity card and the mobile bar
// grew Notes, Shows and the curator crossing, so three primary destinations
// were cold on every load. If you add a nav destination, add it here.

/** Feature flags, read at module scope like every other NEXT_PUBLIC_* gate
 * (inlined at build time). Each mirrors the gate the nav itself uses, so a
 * route whose feature is off is never prefetched — with the flag off those
 * pages bounce or 404, and warming them would be pure waste. */
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';
const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';
const ARTIST_PAGE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_ARTIST_PAGE === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';
const RELATIONSHIPS_ENABLED =
  isRelationshipsFlagOn() &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';
// Paused Oct 27, 2026 (lib/paused-features.ts).
const OPPORTUNITIES_ENABLED = isOpportunitiesEnabled();
const HOME_ENABLED = true;

/** The two destinations every signed-in team account has. Settings left this
 *  list on 2026-09-29: it is a pop-up over these pages now, so there is no
 *  route to warm, and /settings is only a redirect stub. */
const BASE_ROUTES = ['/dashboard', '/dashboard/urgans'] as const;

export type PrefetchAudience = {
  /**
   * Whether this account owns a curator profile — a dual-capability account,
   * which is the only kind that can cross into /curator from the team side.
   *
   * TRI-STATE ON PURPOSE: null means the probe has not answered yet, and it
   * must NOT be read as false. It is a "not yet" rather than a "no", so the
   * crossing is simply left unwarmed until the answer arrives and the caller
   * re-runs. Treating null as no would be the documented dual-account trap,
   * just with a cheaper consequence than usual.
   */
  hasCuratorProfile: boolean | null;
};

/**
 * The routes to warm, in the order they should be requested — most likely
 * destination first, so a link that dies halfway through has still warmed the
 * pages the user was most likely to reach.
 */
export function buildPrefetchRoutes({ hasCuratorProfile }: PrefetchAudience): string[] {
  const routes: string[] = [...BASE_ROUTES];

  // FIRST, ahead of every other push below: with the flag on this is the new
  // landing destination (HOME_PATH), so it is the single most likely page a
  // signed-in account reaches right after the three base routes above warm.
  if (HOME_ENABLED) routes.push('/dashboard/home');
  if (ARTIST_PAGE_ENABLED) routes.push('/dashboard/artists');
  routes.push('/dashboard/team');
  if (NOTES_ENABLED) routes.push('/dashboard/notes');
  // Pitching left the nav (founder, 2026-10-15) and lives inside each
  // rollout, so /dashboard/pitching (now a bridge) is no longer prefetched.
  if (DIRECTORY_ENABLED) routes.push('/dashboard/directory');
  if (RELATIONSHIPS_ENABLED) routes.push('/dashboard/relationships');
  if (OPPORTUNITIES_ENABLED) routes.push('/dashboard/opportunities');
  // Both halves required: the feature has to be on AND this account has to
  // actually be a playlist owner. Everyone else has no such nav entry.
  if (PITCHING_ENABLED && hasCuratorProfile === true) routes.push('/curator');

  return routes;
}
