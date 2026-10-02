/**
 * How Urganize describes itself. One definition, every surface.
 *
 * Founder brief (2026-09-24): you make the music, and Urganize is where your
 * team does everything after. The product is no longer introduced by a
 * category (it was an "AI Music Business Manager" from 2026-09-09 until this
 * brief); it is introduced by what it holds. Three lines, all the founder's,
 * used verbatim: the core line, the short line and the long description.
 * Labels are back in the audience.
 *
 * THIS IS THE MIRROR. The canonical copy, with the full reasoning, is
 * apps/web/lib/positioning.ts. `apps/homepage` cannot import from `apps/web`
 * (separate Next apps, no shared path alias), and a package for eight strings
 * would add an eleventh package.json to bump on every release, so this is a
 * deliberate duplicate on the same trade already recorded for
 * `lib/deploy-version.ts`.
 *
 * DO NOT EDIT ONE OF THESE TWO FILES ALONE. Everything below the comments must
 * stay byte-identical to its twin: `apps/web/lib/positioning-guard.test.ts`
 * strips the comments from both files and compares what is left, so a string
 * changed here and not there fails the build rather than quietly giving the
 * marketing site and the product two different descriptions.
 */

export const CORE_CLAUSE = 'where music teams do everything after the music is made';

export const CORE_LINE = `Urganize is ${CORE_CLAUSE}.`;

export const SHORT_LINE = 'Everything after the music.';

export const AUDIENCE = ['artists', 'managers', 'labels'] as const;

export const AUDIENCE_LINE = `${AUDIENCE.slice(0, -1).join(', ')} and ${AUDIENCE[AUDIENCE.length - 1]}`;

export const BRAND_LINE = `Urganize: ${SHORT_LINE.slice(0, -1)}`;

export const ONE_LINER = SHORT_LINE;

export const SHORT_DESCRIPTION = CORE_LINE;

export const CANONICAL_DESCRIPTION =
  'You make the music. Urganize is where music teams do everything after. ' +
  'Plan the release, assign the work, keep files and metadata in one place, pitch to curators, ' +
  `book shows and put the release out. For ${AUDIENCE_LINE}.`;

export const URGANS_LINE = 'personal AI for music professionals';
