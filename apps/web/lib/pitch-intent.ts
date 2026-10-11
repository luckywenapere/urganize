import { curatorPagePath, isValidCuratorSlug } from './curator-public';
import { isValidClaimToken } from './claim-token-shape';
import { isPlausibleClaimToken } from './seeding';

/**
 * "This person came here to pitch a specific curator."
 *
 * WHY THIS EXISTS. A curator's public page at /pitch/{slug} exists to recruit:
 * an artist reads it, signs up, and should land in the pitch composer already
 * scoped to her. But signing up is a whole wizard — seven steps, an account,
 * and a first rollout created on the way through — so the fact that they came
 * from her page has to survive all of it. Without that, a link she posts drops
 * people on a generic dashboard and she has converted nobody.
 *
 * SESSIONSTORAGE, AND DELIBERATELY NOT auth.user_metadata. The durable
 * mechanism next door (PENDING_INVITE_METADATA_KEY, claimed server-side on the
 * first authenticated request) exists because a failed invite claim strands an
 * account with no membership and nothing that would ever retry. Nothing is
 * stranded here: this is a DESTINATION, and losing it costs one navigation.
 * sessionStorage also already survives the one hard case, the Google OAuth
 * round trip, which is exactly what the onboarding wizard's own resume marker
 * relies on.
 *
 * What it does not survive is starting on a phone and finishing on a laptop.
 * That fails open to the ordinary landing, and moving to user_metadata is the
 * upgrade if it ever proves lossy enough to matter.
 *
 * FAILS TOWARD NO INTENT, the opposite of lib/catalog-intent.ts. There an
 * unwritable store has to answer "yes" or a user gets trapped; here an
 * unwritable store means the artist lands on their dashboard instead of the
 * composer, which is a smaller thing than any probe would buy.
 */

const PITCH_INTENT_KEY = 'urganize.pitch.curator';

/**
 * Record which curator this person came to pitch.
 *
 * Best-effort and never throws: the caller is a click handler on its way into
 * a navigation, and a full store must not turn the one button on that page
 * into an exception.
 */
export function markPitchIntent(slug: string): void {
  if (typeof window === 'undefined') return;
  const normalized = String(slug || '').trim().toLowerCase();
  if (!isValidCuratorSlug(normalized)) return;
  try {
    window.sessionStorage.setItem(PITCH_INTENT_KEY, normalized);
  } catch {
    // Storage blocked or full. They land on the dashboard and can reach
    // Pitching from the nav, which is the whole cost of losing this.
  }
}

/**
 * Read the intent without consuming it.
 *
 * The value is RE-VALIDATED rather than trusted. It comes out of a store the
 * person can edit by hand, and it goes on to build a URL and a query
 * parameter — so a slug that could not have come from us does not get to
 * become either.
 */
export function readPitchIntent(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PITCH_INTENT_KEY);
    if (!raw) return null;
    const normalized = raw.trim().toLowerCase();
    return isValidCuratorSlug(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * Read it and clear it in one step — the shape the onboarding wizard's own
 * resume marker uses, and right for the same reason: an intent that survives
 * being acted on would send them back to the composer every time they finished
 * anything else.
 */
export function takePitchIntent(): string | null {
  const slug = readPitchIntent();
  clearPitchIntent();
  return slug;
}

export function clearPitchIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PITCH_INTENT_KEY);
  } catch {
    // Already gone or blocked; nothing further to do.
  }
}

/** Where the composer lives for one curator. */
export function scopedPitchingPath(slug: string): string {
  return `/dashboard/pitching?curator=${encodeURIComponent(slug)}`;
}

/** Where her page lives, re-exported so callers need one import. */
export { curatorPagePath };

/**
 * Where somebody goes when the onboarding wizard finishes.
 *
 * Pure, so the order is checkable rather than a reading of one line inside a
 * 1500-line component. The order is the decision:
 *
 *   1. The card trial, when that funnel is on. Money outranks everything, and
 *      skipping it would let somebody into the product without the card the
 *      funnel exists to collect.
 *   2. A pitch intent. They came from a curator's page and the whole point of
 *      that page is that they arrive where they meant to.
 *   3. The ordinary landing.
 */
export function resolvePostSignupDestination(input: {
  cardTrialEnabled: boolean;
  cardTrialPath: string;
  pitchCuratorSlug: string | null;
  /** A claim link they came from, so they land back on the page to claim
   *  (2026-10-10). Optional so every existing caller is unchanged. */
  claimToken?: string | null;
  homePath: string;
  /** A seeding link they still have to finish (lib/welcome-intent.ts). */
  welcomeToken?: string | null;
}): string {
  if (input.cardTrialEnabled) return input.cardTrialPath;
  if (input.claimToken && isValidClaimToken(input.claimToken)) return `/claim/${input.claimToken}`;
  // Somebody Wena invited has one thing left to do, and it is on that page.
  if (isPlausibleClaimToken(input.welcomeToken)) return `/welcome/${input.welcomeToken}`;
  const slug = String(input.pitchCuratorSlug || '').trim().toLowerCase();
  if (slug && isValidCuratorSlug(slug)) return scopedPitchingPath(slug);
  return input.homePath;
}
