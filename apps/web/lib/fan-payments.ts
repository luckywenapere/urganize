/**
 * Fan payments (2026-10-11): a second partner, shown beside distribution.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. Fanlly (fanlly.co, Lagos) lets an artist
 * upload a track, share one link, and have fans tip them directly: by bank
 * transfer in Nigeria, by card or Apple Pay abroad, with no fan account. The
 * artist is paid in naira and keeps 75% of every tip.
 *
 * Fanlly is NOT a distributor. It does not deliver music to stores, so it is
 * never the default distributor and never stands in for Therealmusic Distro
 * (lib/distribution.ts). It sits next to it as a separate option.
 *
 * There is no Fanlly API. The whole integration is one referral link that opens
 * their creator sign-up in a new tab. Urganize records nothing, takes no
 * payment and makes no claim to a share of anything, and nothing here may
 * suggest it does.
 *
 * Pure: no React, no I/O, no environment reads.
 */

/** The partner. One place for the name and the link, so no screen can carry a
 *  stale or different referral code. */
export const FAN_PAYMENTS_PARTNER = {
  name: 'Fanlly',
  /** Our referral link to Fanlly's creator sign-up. Every Fanlly button opens
   *  this and nothing else. */
  signupUrl: 'https://creator.fanlly.co/?ref=7E6MUWD',
  /** The share of every tip the artist keeps, per Fanlly's own site. */
  creatorSharePercent: 75,
} as const;
