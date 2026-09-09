/**
 * How Urganize describes itself. One definition, every surface.
 *
 * Founder brief (2026-09-09): the product is an **AI Music Manager**. Every
 * page, tag, email, store listing and assistant reply that introduces it says
 * so in the same words, and the only thing allowed to vary between surfaces is
 * how many characters fit.
 *
 * WHY A MODULE RATHER THAN THE STRING AT EACH CALL SITE. This repo has shipped
 * the display-vs-reality gap four times with prices, once with the share card's
 * alt text against the card's own baked tagline, and twice with a landing title
 * that existed in two files. Positioning is worse than a price when it drifts,
 * because nothing errors: two pages simply describe a different product and
 * nobody notices for a month.
 *
 * THIS FILE IS DUPLICATED, DELIBERATELY, at apps/homepage/lib/positioning.ts.
 * `apps/homepage` cannot import from `apps/web` (separate Next apps, no shared
 * path alias), and a package for eight strings would add an eleventh
 * package.json to bump on every release. That is the same trade already
 * recorded for `lib/deploy-version.ts`, whose homepage twin is a deliberate
 * 20-line copy. What makes it safe is that the copy is not trusted to stay in
 * step by care: `lib/positioning-guard.test.ts` reads the homepage file and
 * fails if a single string differs. A THIRD consumer is the moment to promote
 * this into a package.
 */

/**
 * The category. Leads any sentence that introduces the product, and is the
 * thing every meta description has to contain.
 */
export const PRODUCT_CATEGORY = 'AI Music Manager';

/**
 * Who it is for, in the fixed order artists, managers, labels.
 *
 * ARTISTS ALWAYS LEAD, and the order is never reordered for emphasis. It is
 * data rather than a baked string so the guard can pin the order rather than
 * pin one sentence that happens to contain it.
 */
export const AUDIENCE = ['artists', 'managers', 'labels'] as const;

/** "artists, managers and labels" — built from the list above so the order
 * cannot be rewritten in prose without rewriting the list. */
export const AUDIENCE_LINE = `${AUDIENCE.slice(0, -1).join(', ')} and ${AUDIENCE[AUDIENCE.length - 1]}`;

/** The brand line. The homepage title, and nothing else in the app uses it. */
export const BRAND_LINE = `Urganize, ${PRODUCT_CATEGORY}`;

/** Category plus audience. A headline, never a sentence on its own. */
export const CUSTOMER_LINE = `${PRODUCT_CATEGORY} for ${AUDIENCE_LINE}`;

/** What it does, in the customer's words. Carried by a subhead, under a
 * headline that already carried the category. */
export const PROMISE = 'Plan, organize and execute releases from one place';

/**
 * Under 80 characters. Bios, OG cards, anywhere a single line is all there is.
 */
export const ONE_LINER = `${CUSTOMER_LINE}.`;

/**
 * Under 160 characters. Meta descriptions and store listings, i.e. the two
 * places a hard limit is enforced by somebody else's software.
 */
export const SHORT_DESCRIPTION = `${CUSTOMER_LINE}. ${PROMISE}.`;

/**
 * The full description. Used where there is room to say what the product
 * actually does rather than only what it is.
 *
 * Written out rather than composed from the parts above: it is one paragraph of
 * prose with its own rhythm, and assembling it from fragments would produce a
 * sentence that reads like it was assembled from fragments.
 */
export const CANONICAL_DESCRIPTION =
  'Urganize is an AI Music Manager for artists, managers and labels. It helps music teams plan releases, ' +
  'coordinate people, manage assets and metadata, track execution and keep every part of a rollout moving ' +
  'from one place.';

/**
 * UrgAns is NOT the product, and this line is the whole of the distinction.
 *
 * It is the AI inside Urganize. When it is asked what it is, it says this;
 * when it is asked what Urganize is, it says the category. Collapsing the two
 * would make the assistant the product, which is the positioning error this
 * brief exists to correct.
 */
export const URGANS_LINE = 'personal AI for music professionals';
