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
 * 2026-10-17 (URG-334): the founder approved the homepage v2 hero, so the short
 * line is now "Every release, on plan.", the promise line under it is new, and
 * the long description leads with both. The same day (URG-344) the core line
 * followed: "Urganize is where music teams plan every release and deliver it
 * on time."
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

export const CORE_CLAUSE = 'where music teams plan every release and deliver it on time';

export const CORE_LINE = `Urganize is ${CORE_CLAUSE}.`;

export const SHORT_LINE = 'Every release, on plan.';

export const PROMISE_LINE = 'Add a release. Get the plan. Your team knows what to do and when.';

export const AUDIENCE = ['artists', 'managers', 'labels'] as const;

export const AUDIENCE_LINE = `${AUDIENCE.slice(0, -1).join(', ')} and ${AUDIENCE[AUDIENCE.length - 1]}`;

export const BRAND_LINE = `Urganize: ${SHORT_LINE.slice(0, -1)}`;

export const ONE_LINER = SHORT_LINE;

export const SHORT_DESCRIPTION = CORE_LINE;

export const CANONICAL_DESCRIPTION =
  'Every release, on plan. Add a release and get the plan, week by week to release day, ' +
  'so your team knows what to do and when. Built for artist managers.';

export const URGANS_LINE = 'personal AI for music professionals';
