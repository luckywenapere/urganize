/**
 * How Urganize describes itself. One definition, every surface.
 *
 * Founder brief (2026-09-24): you make the music, and Urganize is where your
 * team does everything after. The product is no longer introduced by a
 * category (it was an "AI Music Business Manager" from 2026-09-09 until this
 * brief); it is introduced by what it holds. Every page, tag, email and store
 * listing that introduces it says so in the same words, and the only thing
 * allowed to vary between surfaces is how many characters fit.
 *
 * Three lines, all the founder's, used verbatim:
 *  - the core line (`CORE_LINE`), for anything that introduces the product;
 *  - the short line (`SHORT_LINE`), for page titles, meta titles and tight bios;
 *  - the long description (`CANONICAL_DESCRIPTION`), wherever there is room.
 *
 * LABELS ARE BACK IN THE AUDIENCE. They were dropped on 2026-09-11, and the
 * long description's own last sentence ("For artists, managers and labels.")
 * puts them back, so the list below has three entries again. "Small labels"
 * stays retired in the guard; "for labels" does not.
 *
 * UrgAns says it too, since 2026-09-25. It kept the old category for one day
 * while the founder decided how the assistant describes the product; now
 * lib/chappi/system-prompt.ts quotes CORE_LINE and CANONICAL_DESCRIPTION from
 * here, lib/task-outcomes.ts introduces UrgAns with URGANS_LINE and
 * CORE_CLAUSE, and the guard retires the old category everywhere, no
 * exemptions.
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
 * The core line without its subject: "where music teams do everything after
 * the music is made". For a sentence that already names Urganize ("Urganize,
 * where music teams...", "Urganize is where music teams...") so a page can say it
 * without repeating the name twice in a row.
 *
 * "Music teams" since 2026-10-02, the strategy doc's one-line version
 * (docs/strategy/company-strategy.md, section 1). It said "your team" from
 * 2026-09-24. The long description below says it too, from the same day.
 */
export const CORE_CLAUSE = 'where music teams do everything after the music is made';

/** The core line. Introduces the product anywhere a whole sentence fits. */
export const CORE_LINE = `Urganize is ${CORE_CLAUSE}.`;

/** The short line. Page titles, meta titles, tight bios, the share card. */
export const SHORT_LINE = 'Everything after the music.';

/**
 * Who it is for, in the fixed order artists, managers, labels.
 *
 * ARTISTS ALWAYS LEAD, and the order is never reordered for emphasis. It is
 * data rather than a baked string so the guard can pin the order rather than
 * pin one sentence that happens to contain it. Labels were dropped on
 * 2026-09-11 and came back on 2026-09-24 with the founder's long description.
 */
export const AUDIENCE = ['artists', 'managers', 'labels'] as const;

/** "artists, managers and labels", built from the list above so the order
 * cannot be rewritten in prose without rewriting the list. No Oxford comma. */
export const AUDIENCE_LINE = `${AUDIENCE.slice(0, -1).join(', ')} and ${AUDIENCE[AUDIENCE.length - 1]}`;

/** The brand line. The homepage title, and nothing else in the app uses it. */
export const BRAND_LINE = `Urganize: ${SHORT_LINE.slice(0, -1)}`;

/**
 * Under 80 characters. Bios, the footer tagline, anywhere a single line is all
 * there is.
 */
export const ONE_LINER = SHORT_LINE;

/**
 * Under 160 characters. The PWA manifest and store fields, i.e. the places a
 * hard limit is enforced by somebody else's software.
 */
export const SHORT_DESCRIPTION = CORE_LINE;

/**
 * The long description, verbatim from the founder. Used where there is room to
 * say what the product actually does rather than only what it is.
 *
 * Written out rather than composed from the parts above, apart from the
 * audience, so the one list the guard pins is the one list the prose uses.
 * "Release" is the founder's word here and it is right: it is the unit that
 * gets planned and put out, which is the vocabulary rule (rollout is the work,
 * release is the unit).
 */
export const CANONICAL_DESCRIPTION =
  'You make the music. Urganize is where music teams do everything after. ' +
  'Plan the release, assign the work, keep files and metadata in one place, pitch to curators, ' +
  `book shows and put the release out. For ${AUDIENCE_LINE}.`;

/**
 * UrgAns is NOT the product, and this line is the whole of the distinction.
 *
 * It is the AI inside Urganize. When it is asked what it is, it says this.
 * Collapsing the two would make the assistant the product, which is the
 * positioning error every brief since 2026-09-09 has been careful to avoid.
 */
export const URGANS_LINE = 'personal AI for music professionals';
