/**
 * How Urganize describes itself. One definition, every surface.
 *
 * Founder brief (2026-09-09, amended 2026-09-11): the product is an **AI Music
 * Business Manager**. Every page, tag, email, store listing and assistant reply
 * that introduces it says so in the same words, and the only thing allowed to
 * vary between surfaces is how many characters fit.
 *
 * The amendment widened the category from "AI Music Manager" and changed nothing
 * else: the audience order, the promise and the UrgAns line are untouched. It
 * cost nine characters. Every derived string absorbs that; the one field that
 * cannot is the app store name, whose 30-character cap the full category no
 * longer fits. See docs/store-listing.md.
 *
 * Amended again 2026-09-11 (founder call, later the same day): "labels" is
 * dropped from the audience. It is artists and managers. Artists still lead,
 * the category, the promise and the UrgAns line are untouched, and every
 * derived string absorbs it. The /for-labels persona page went with it.
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

export const PRODUCT_CATEGORY = 'AI Music Business Manager';

export const AUDIENCE = ['artists', 'managers'] as const;

export const AUDIENCE_LINE = `${AUDIENCE.slice(0, -1).join(', ')} and ${AUDIENCE[AUDIENCE.length - 1]}`;

export const BRAND_LINE = `Urganize, ${PRODUCT_CATEGORY}`;

export const CUSTOMER_LINE = `${PRODUCT_CATEGORY} for ${AUDIENCE_LINE}`;

export const PROMISE = 'Plan, organize and execute rollouts from one place';

export const ONE_LINER = `${CUSTOMER_LINE}.`;

export const SHORT_DESCRIPTION = `${CUSTOMER_LINE}. ${PROMISE}.`;

export const CANONICAL_DESCRIPTION =
  'Urganize is an AI Music Business Manager for artists and managers. It helps music teams plan rollouts, ' +
  'coordinate people, manage assets and metadata, track execution and keep every part moving ' +
  'from one place.';

export const URGANS_LINE = 'personal AI for music professionals';
