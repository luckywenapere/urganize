/**
 * Distribution, step one (2026-10-03): getting a rollout to Therealmusic Distro.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. The signed Distribution Partner Agreement
 * plans an order placed inside Urganize through the partner's API, paid through
 * Paystack. That API does not exist yet (the partner is building it), so today a
 * team does the one thing that works: it signs up with the partner through a
 * link the partner gave us, then sets the account up on the partner's own site,
 * and pays them there. This module is that step. It does NOT take an order, a
 * payment or a file, and nothing here may suggest it does.
 *
 * What Urganize adds is the part it can know: whether the rollout is ready to
 * be delivered, and a record that the team went across, so the founder can check
 * the partner's monthly statement against our own count.
 *
 * THE RULES MOVED (2026-10-09). The readiness checklist that lived here was
 * replaced by the check before distribution: lib/distribution-rules.ts holds
 * every rule, lib/distribution-server.ts reads the facts and runs them, and the
 * route refuses an order that has errors. This module keeps what is about the
 * PARTNER and the clock: who they are and how long delivery takes.
 *
 * Pure: no React, no I/O, no environment reads.
 */

/** The partner. One place for the name and the links, so the scene, the tests
 *  and any later order flow cannot disagree about who the default distributor
 *  is (contract clause 2.3: Therealmusic Distro is shown by default). */
export const DISTRIBUTION_PARTNER = {
  name: 'Therealmusic Distro',
  /** The sign-up link the partner gave us (2026-10-03). It creates the account
   *  and tells the partner the person came from Urganize. */
  signupUrl: 'https://therealmusicdistro.com/urganize/',
  /** Shown before anyone leaves, because the agreement (clause 6b) requires the
   *  partner's terms to be put in front of the user. */
  termsUrl: 'https://therealmusicdistro.com/terms-conditions/',
} as const;

/** Stores take up to this long after a complete release arrives (Schedule C of
 *  the agreement). A date closer than this cannot be promised. */
export const DELIVERY_WORKING_DAYS = 14;

/** Roughly three weeks, which is 14 working days plus the time it takes to
 *  finish setting the account up. A date nearer than this gets a warning. */
export const SAFE_LEAD_DAYS = 21;

const present = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Whether the release date leaves enough room for the stores. Returns a plain
 * sentence, or null when there is nothing to warn about (no date, or enough
 * time). A date in the past is not an error: music is often distributed late.
 *
 * `today` is passed in, never read here, so a test can pin it. Dates are read as
 * calendar days in UTC so a release on the 3rd is the same day everywhere.
 */
export function releaseDateWarning(releaseDate: string | null, today: Date): string | null {
  if (!present(releaseDate)) return null;
  const parsed = Date.parse(`${String(releaseDate).slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysAway = Math.round((parsed - startOfToday) / 86_400_000);
  if (daysAway < 0) {
    return 'This date has passed. Stores will put it live as soon as they can after delivery.';
  }
  if (daysAway < SAFE_LEAD_DAYS) {
    return `Stores can take up to ${DELIVERY_WORKING_DAYS} working days. A date this close may be missed, so move it back if you can.`;
  }
  return null;
}
