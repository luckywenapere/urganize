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
 * be delivered (the song, the cover, the details the stores ask for), and a
 * record that the team went across, so the founder can check the partner's
 * monthly statement against our own count.
 *
 * Pure: no React, no I/O, no environment reads beyond the one flag. The facts
 * come from lib/distribution-server.ts.
 */

import type { SceneName } from './scene-cache';

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

export function isDistributionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_DISTRIBUTION === 'true';
}

/** What the server reads off the rollout. Plain data, so this module needs no
 *  database. */
export type DistributionFacts = {
  /** releases.release_date, as stored (a date or null). */
  releaseDate: string | null;
  /** At least one audio asset is attached. */
  hasSong: boolean;
  /** releases.artwork_asset_id is set. */
  hasCoverArt: boolean;
  /** release_metadata, or null when the row does not exist yet. */
  metadata: {
    genre: string | null;
    language: string | null;
    /** True, false, or null when never answered. */
    explicit: boolean | null;
    labelName: string | null;
  } | null;
  /** Credits collaborators have submitted through the collect link. */
  creditsCount: number;
};

export type DistributionCheckKey =
  | 'date'
  | 'song'
  | 'cover'
  | 'genre'
  | 'language'
  | 'explicit'
  | 'credits'
  | 'label';

export type DistributionCheck = {
  key: DistributionCheckKey;
  label: string;
  done: boolean;
  /** A required item blocks a clean delivery; a recommended one does not. */
  required: boolean;
  /** One short line on what to do. Empty when done. */
  hint: string;
  /** The scene that fixes it, so the checklist can offer a way there. */
  fixIn: SceneName | null;
};

const present = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export function buildDistributionChecks(
  facts: DistributionFacts,
  flags: { metadata: boolean; song: boolean; coverArt: boolean }
): DistributionCheck[] {
  const meta = facts.metadata;
  const fix = (scene: SceneName, on: boolean): SceneName | null => (on ? scene : null);

  return [
    {
      key: 'date',
      label: 'Release date',
      done: present(facts.releaseDate),
      required: true,
      hint: 'Set a date on the rollout so the stores know when to go live.',
      fixIn: null,
    },
    {
      key: 'song',
      label: 'The song',
      done: facts.hasSong,
      required: true,
      hint: 'Upload the final master as a WAV, MP3 or FLAC.',
      fixIn: fix('song', flags.song),
    },
    {
      key: 'cover',
      label: 'Cover art',
      done: facts.hasCoverArt,
      required: true,
      hint: 'Stores want a square image, 3000 by 3000 pixels.',
      fixIn: fix('coverart', flags.coverArt),
    },
    {
      key: 'genre',
      label: 'Genre',
      done: present(meta?.genre),
      required: true,
      hint: 'Pick the genre the stores should file it under.',
      fixIn: fix('metadata', flags.metadata),
    },
    {
      key: 'language',
      label: 'Language',
      done: present(meta?.language),
      required: true,
      hint: 'Say what language the lyrics are in.',
      fixIn: fix('metadata', flags.metadata),
    },
    {
      key: 'explicit',
      label: 'Explicit or clean',
      // false is an answer. Only null (never answered) is missing.
      done: meta?.explicit === true || meta?.explicit === false,
      required: true,
      hint: 'Stores need to know if the lyrics are explicit.',
      fixIn: fix('metadata', flags.metadata),
    },
    {
      key: 'credits',
      label: 'Songwriter and producer credits',
      done: facts.creditsCount > 0,
      required: false,
      hint: 'Send your collaborators the collect link so the credits are on file.',
      fixIn: fix('metadata', flags.metadata),
    },
    {
      key: 'label',
      label: 'Label name',
      done: present(meta?.labelName),
      required: false,
      hint: 'Add it if there is a label. Leave it empty for self-released music.',
      fixIn: fix('metadata', flags.metadata),
    },
  ];
}

export type DistributionReadiness = {
  checks: DistributionCheck[];
  requiredDone: number;
  requiredTotal: number;
  /** Every required item is done. */
  ready: boolean;
  /** The recommended items still open, for the "also worth doing" line. */
  recommendedOpen: number;
};

export function summarizeDistribution(checks: DistributionCheck[]): DistributionReadiness {
  const required = checks.filter((check) => check.required);
  const requiredDone = required.filter((check) => check.done).length;
  return {
    checks,
    requiredDone,
    requiredTotal: required.length,
    ready: requiredDone === required.length,
    recommendedOpen: checks.filter((check) => !check.required && !check.done).length,
  };
}

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
