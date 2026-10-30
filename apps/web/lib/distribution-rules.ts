/**
 * The check before distribution (2026-10-09, brief 2 of the release savings
 * pack): every rule that decides whether a rollout can go to the distributor, in
 * one list.
 *
 * WHY IT EXISTS. Bad metadata gets a release rejected or delayed, and wrong
 * credits or splits go out with the music. Catching it here costs nothing; the
 * distributor catching it costs days. Rules only: no AI, no credits, every plan.
 *
 * ONE LIST, ONE ENTRY EACH. A new rule is one more object in DISTRIBUTION_RULES:
 * a code, a level, where the Fix button sends the person, and a function that
 * returns the messages it wants to raise (none means it passes). The route, the
 * Distribute scene and the status on the rollout all read the same list through
 * checkDistributionFacts, so they cannot disagree.
 *
 * PURE. The facts come from lib/distribution-server.ts; the clock is passed
 * in, so a test pins it.
 *
 * NO AUDIO. Urganize does not take the song's audio (song upload was removed
 * everywhere on Oct 17, 2026): the master goes from the team to the
 * distributor directly, so no rule asks for or grades an audio file.
 *
 * ONE SONG PER ROLLOUT. A rollout holds one song (there is no track list), so
 * "every track" in the brief means the rollout, and `{track}` is its title. A
 * future track model changes the facts and not the rules' shape.
 *
 * COPY. The messages are the brief's, word for word. Two rules carry text the
 * brief does not give (the old checklist's language line and the old
 * delivery-time warning); they keep the wording they already had in the app.
 */

import { DSP_MIME_TYPES, DSP_MIN_EDGE } from './cover-art-dsp';
import { requiredSplits } from './credit-submissions';
import { formatSplitValue, splitTotalIsOff, sumSplits } from './credit-split-totals';
import { releaseDateWarning } from './distribution';
import { daysToRelease } from './editorial-pitch';
import { isDefaultReleaseTitle } from '@/types/releases';
import type { ReleaseCreditRole } from '@/types/credits';

/** A release day nearer than this makes a Spotify editorial pitch tight. */
export const PITCH_WINDOW_WARNING_DAYS = 35;

export type DistributionIssueLevel = 'error' | 'warning';

export type DistributionIssueCode =
  | 'missing_title'
  | 'missing_primary_artist'
  | 'missing_release_date'
  | 'missing_genre'
  | 'missing_language'
  | 'missing_explicit_flag'
  | 'missing_songwriter_credits'
  | 'artwork_missing'
  | 'artwork_not_square'
  | 'artwork_too_small'
  | 'artwork_wrong_format'
  | 'feat_in_title'
  | 'title_all_caps'
  | 'splits_not_100'
  | 'pitch_window_tight'
  | 'release_date_tight';

/**
 * Where a Fix button sends the person. A path, not a URL: lib/distribution-fix.ts
 * turns each one into a destination, so a rule only ever says WHAT is wrong with
 * WHICH thing and never how the app is laid out.
 */
export type DistributionFieldPath =
  | 'title'
  | 'artist'
  | 'release_date'
  | 'metadata.genre'
  | 'metadata.language'
  | 'metadata.explicit'
  | 'metadata.featured_artists'
  | 'credits'
  | 'credits.splits'
  | 'artwork';

export type DistributionIssue = {
  code: DistributionIssueCode;
  /** The sentence a person reads. */
  message: string;
  fieldPath: DistributionFieldPath;
};

export type DistributionCheckResult = {
  /** Block the order. */
  errors: DistributionIssue[];
  /** Do not block it. */
  warnings: DistributionIssue[];
};

/** What the server reads off the rollout. Plain data, so this module needs no
 *  database. */
export type DistributionFacts = {
  title: string;
  /** releases.artist_name, the write-through cache of the artist's name. */
  primaryArtist: string;
  /** releases.release_date, as stored (a date or null). */
  releaseDate: string | null;
  genre: string | null;
  language: string | null;
  /** True, false, or null when never answered. Unset is not "not explicit". */
  explicit: boolean | null;
  /** The artwork asset, or null when the rollout has none. Width and height are
   *  null for an upload from before 2026-08-22, when they were not recorded. */
  artwork: {
    mimeType: string | null;
    width: number | null;
    height: number | null;
  } | null;
  /** Credits collaborators have submitted. */
  credits: Array<{
    roles: readonly string[];
    songwriterSplit: number | null;
    masterSplit: number | null;
  }>;
  /** releases.skipped_distribution_warnings: warnings the team chose to skip.
   *  Only codes in SKIPPABLE_WARNINGS are honoured. Absent reads as none. */
  skippedWarnings?: readonly string[];
};

/**
 * Warnings a team may skip for one rollout, with the button's words (founder,
 * Oct 31, 2026: a tight pitch window is advice, not a must, so the team can say
 * "we've missed it" and stop seeing it). Errors can never be skipped.
 */
export const SKIPPABLE_WARNINGS: Readonly<Record<string, { label: string; done: string }>> = {
  pitch_window_tight: { label: 'Skip pitch', done: 'Got it. No Spotify pitch for this one.' },
  // Moving the date is the fix; keeping it is the team's call (Oct 31, 2026).
  release_date_tight: { label: 'Keep date', done: 'Got it. Keeping this date.' },
};

export function isSkippableWarning(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(SKIPPABLE_WARNINGS, code);
}

export type DistributionCheckContext = {
  /** Read once by the caller and passed in, so a test can pin it. */
  today: Date;
};

type DistributionRule = {
  code: DistributionIssueCode;
  level: DistributionIssueLevel;
  fieldPath: DistributionFieldPath;
  /** The messages this rule raises. An empty list means it passes. Most rules
   *  raise at most one; the splits rule raises one per kind of split that is
   *  off. */
  check: (facts: DistributionFacts, context: DistributionCheckContext) => string[];
};

const present = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

const edgesKnown = (artwork: NonNullable<DistributionFacts['artwork']>): boolean =>
  typeof artwork.width === 'number' &&
  typeof artwork.height === 'number' &&
  Number.isFinite(artwork.width) &&
  Number.isFinite(artwork.height) &&
  artwork.width > 0 &&
  artwork.height > 0;

// "feat", "ft." and "featuring" as whole words, so "Feature Presentation" and
// "Left" do not trip it. A warning, never an error: "Ft Lauderdale" is a real
// title and the person is the judge.
const FEATURING_IN_TITLE = /\b(feat|ft|featuring)\b/i;

/** Letters only, so a title like "BLESS UP 2" counts "BLESSUP". */
const lettersOf = (title: string): string => title.replace(/[^\p{L}]/gu, '');

export const DISTRIBUTION_RULES: readonly DistributionRule[] = [
  // ---- Errors: these block the order ----------------------------------------
  {
    code: 'missing_title',
    level: 'error',
    fieldPath: 'title',
    // A rollout made with no title is called "Untitled rollout" by the server,
    // so a placeholder counts as no title at all.
    check: (facts) => (isDefaultReleaseTitle(facts.title) ? ['Add a release title.'] : []),
  },
  {
    code: 'missing_primary_artist',
    level: 'error',
    fieldPath: 'artist',
    check: (facts) => (present(facts.primaryArtist) ? [] : ['Add the main artist.']),
  },
  {
    code: 'missing_release_date',
    level: 'error',
    fieldPath: 'release_date',
    check: (facts) => (present(facts.releaseDate) ? [] : ['Set a release day.']),
  },
  {
    code: 'missing_genre',
    level: 'error',
    fieldPath: 'metadata.genre',
    check: (facts) => (present(facts.genre) ? [] : ['Pick a genre.']),
  },
  {
    // Not in the brief, kept from the checklist this replaces: the stores ask
    // for the language, and a rollout that was ready yesterday should not become
    // ready by dropping a question. Wording is the checklist's.
    code: 'missing_language',
    level: 'error',
    fieldPath: 'metadata.language',
    check: (facts) => (present(facts.language) ? [] : ['Say what language the lyrics are in.']),
  },
  {
    code: 'missing_explicit_flag',
    level: 'error',
    fieldPath: 'metadata.explicit',
    // false is an answer. Only null (never answered) is missing.
    check: (facts) => (facts.explicit === true || facts.explicit === false ? [] : ['Say if the release is explicit.']),
  },
  {
    // Any writing credit counts: songwriter, composer or lyricist, which is the
    // same set lib/credit-submissions.ts asks a writing share of.
    code: 'missing_songwriter_credits',
    level: 'error',
    fieldPath: 'credits',
    check: (facts) =>
      facts.credits.some((credit) => requiredSplits(credit.roles as readonly ReleaseCreditRole[]).songwriter)
        ? []
        : ['Add songwriter credits to every track.'],
  },
  {
    code: 'artwork_missing',
    level: 'error',
    fieldPath: 'artwork',
    check: (facts) => (facts.artwork ? [] : ['Add artwork.']),
  },
  {
    code: 'artwork_not_square',
    level: 'error',
    fieldPath: 'artwork',
    check: (facts) => {
      const artwork = facts.artwork;
      if (!artwork || !edgesKnown(artwork)) return [];
      return Math.round(artwork.width as number) === Math.round(artwork.height as number)
        ? []
        : ['Artwork has to be square.'];
    },
  },
  {
    code: 'artwork_too_small',
    level: 'error',
    fieldPath: 'artwork',
    check: (facts) => {
      const artwork = facts.artwork;
      if (!artwork) return [];
      // An upload from before 2026-08-22 has no recorded size. That reads as too
      // small rather than as fine: this check blocks an order, so "we do not
      // know" has to fail. Uploading the artwork again records its size.
      if (!edgesKnown(artwork)) return ['Artwork has to be at least 3000 x 3000 px.'];
      const smallest = Math.min(artwork.width as number, artwork.height as number);
      return Math.round(smallest) < DSP_MIN_EDGE ? ['Artwork has to be at least 3000 x 3000 px.'] : [];
    },
  },
  {
    code: 'artwork_wrong_format',
    level: 'error',
    fieldPath: 'artwork',
    check: (facts) => {
      const artwork = facts.artwork;
      if (!artwork) return [];
      return DSP_MIME_TYPES.includes((artwork.mimeType ?? '').toLowerCase())
        ? []
        : ['Artwork has to be JPG or PNG.'];
    },
  },

  // ---- Warnings: worth a look, never blocking --------------------------------
  {
    code: 'feat_in_title',
    level: 'warning',
    fieldPath: 'metadata.featured_artists',
    check: (facts) =>
      FEATURING_IN_TITLE.test(facts.title)
        ? ['Put featured artists in the Featured artist field, not the title.']
        : [],
  },
  {
    code: 'title_all_caps',
    level: 'warning',
    fieldPath: 'title',
    check: (facts) => {
      const letters = lettersOf(facts.title);
      // More than three letters, and at least one that could be lower case (so a
      // title in a script with no case is never "all caps").
      return letters.length > 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()
        ? ['Stores often reject titles in all caps.']
        : [];
    },
  },
  {
    // Writing shares and recording shares are two sets of splits, each of which
    // has to come to 100 on its own, so each raises its own warning. The brief's
    // sentence has no slot for which one, so the track name carries it.
    // TODO(copy): the brief gives one template; this names the kind of share.
    code: 'splits_not_100',
    level: 'warning',
    fieldPath: 'credits.splits',
    check: (facts) => {
      const track = present(facts.title) ? facts.title.trim() : 'this rollout';
      const messages: string[] = [];
      const writing = sumSplits(facts.credits.map((credit) => credit.songwriterSplit));
      if (writing.answered && splitTotalIsOff(writing.total)) {
        messages.push(
          `Splits on ${track} (writing shares) add up to ${formatSplitValue(writing.total)}%. They should add up to 100%.`
        );
      }
      const master = sumSplits(facts.credits.map((credit) => credit.masterSplit));
      if (master.answered && splitTotalIsOff(master.total)) {
        messages.push(
          `Splits on ${track} (master shares) add up to ${formatSplitValue(master.total)}%. They should add up to 100%.`
        );
      }
      return messages;
    },
  },
  {
    // Only while the day is still ahead: a past date is the delivery warning's
    // business, and "tight for a pitch" means nothing once release day is gone.
    code: 'pitch_window_tight',
    level: 'warning',
    fieldPath: 'release_date',
    check: (facts, context) => {
      const days = daysToRelease(facts.releaseDate, context.today);
      return days !== null && days >= 0 && days < PITCH_WINDOW_WARNING_DAYS
        ? ['Release day is under 35 days away. That’s tight for a Spotify pitch.']
        : [];
    },
  },
  {
    // Not in the brief, kept from the checklist this replaces: stores take up to
    // 14 working days (Schedule C of the partner agreement), so a date inside
    // three weeks, or one that has passed, deserves a plain word. Wording is the
    // old warning's.
    code: 'release_date_tight',
    level: 'warning',
    fieldPath: 'release_date',
    check: (facts, context) => {
      const warning = releaseDateWarning(facts.releaseDate, context.today);
      return warning ? [warning] : [];
    },
  },
];

/**
 * Run every rule over the facts. Errors and warnings each keep the order of the
 * list above, so the same rollout always reads the same way.
 */
export function checkDistributionFacts(
  facts: DistributionFacts,
  context: Partial<DistributionCheckContext> = {}
): DistributionCheckResult {
  const resolved: DistributionCheckContext = {
    today: context.today ?? new Date(),
  };
  const errors: DistributionIssue[] = [];
  const warnings: DistributionIssue[] = [];
  const skipped = new Set((facts.skippedWarnings ?? []).filter(isSkippableWarning));
  for (const rule of DISTRIBUTION_RULES) {
    if (rule.level === 'warning' && skipped.has(rule.code)) continue;
    for (const message of rule.check(facts, resolved)) {
      const issue: DistributionIssue = { code: rule.code, message, fieldPath: rule.fieldPath };
      (rule.level === 'error' ? errors : warnings).push(issue);
    }
  }
  return { errors, warnings };
}
