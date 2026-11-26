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
 * long description's last sentence ("For artists, managers and labels.") put
 * them back, so the list below has three entries again. Since 2026-10-18 the
 * long description says "Built for artist managers." instead (founder call,
 * artist-managers-first); the list still drives the visible pages. "Small labels"
 * and "for labels" are both allowed again (small labels since 2026-10-02, the
 * strategy doc names them among the teams we sell to).
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
 * POSITIONING SINCE 2026-11-26 (founder, issue #1405): "Urganize is the
 * operating system for independent music careers." Joshua Perez (Greylight)
 * recommended it after reviewing the pre-seed deck, and Oyin agreed the same
 * day to bring the operating-system line back everywhere. It helps independent
 * artists and managers run their careers as businesses: planning,
 * coordinating and growing a career, not just keeping a task list. The
 * headline stays: "A music career shouldn't run on a group chat."
 *
 * "Operating system for music" was retired on 2026-09-24 with the old
 * category. This line is the founder reversing that call, not a slip: the
 * guard now pins it instead of banning it.
 *
 * Retired the same day (2026-11-15 to 2026-11-26, #1299): "a planning and
 * coordination app for recording artists, managers and labels", the eyebrow
 * "Planning and coordination for recording artists, managers and labels", the
 * short line "One plan. Every task has an owner." and the brand line
 * "Urganize: Planning and coordination for music teams". Their history is in
 * git.
 *
 * Still not said: "keeps learning". Task answers feed the review after the
 * work is done; nothing yet feeds them back into the next plan.
 */

/**
 * The core line without its subject, for a sentence that already names
 * Urganize ("Urganize, the operating system for...").
 */
export const CORE_CLAUSE = 'the operating system for independent music careers';

/** The core line, the founder's words. Introduces the product anywhere a whole sentence fits. */
export const CORE_LINE = `Urganize is ${CORE_CLAUSE}.`;

/**
 * The short line. Page titles, meta titles, tight bios, the footer, the share
 * card. Since 2026-11-26.
 */
export const SHORT_LINE = 'Run your music career like a business.';

/**
 * The homepage headline, in two parts so the page can colour the second
 * without typing the words again. Founder's line, approved 2026-11-15, kept
 * on 2026-11-26.
 */
export const HERO_HEADLINE_LEAD = "A music career shouldn't run";
export const HERO_HEADLINE_ACCENT = 'on a group chat.';
export const HERO_HEADLINE = `${HERO_HEADLINE_LEAD} ${HERO_HEADLINE_ACCENT}`;

/** The line above the headline: what it is. */
export const HERO_EYEBROW = 'The operating system for independent music careers';

/** The line under the headline. The founder's words. */
export const HERO_SUBHEAD =
  'Tell it your goals. It makes the plan. Every task has one owner and one date. It reminds each person, so nobody has to chase.';

/** What the plan covers, in one breath. A release is one kind of work among these. */
export const PROMISE_LINE = 'Releases, shows, pitching, press and distribution, on one plan.';

/**
 * The learning loop, in words that are true today: the "how did it go?" sheet
 * after a task is live, and its answers feed the review.
 */
export const LEARNING_LINE = 'After every task, Urganize asks how it went, so you can see what worked.';

/**
 * Who it is for, in a fixed order: independent artists first, then managers.
 *
 * ARTISTS ALWAYS LEAD, and the order is never reordered for emphasis. It is
 * data rather than a baked string so the guard can pin the order rather than
 * pin one sentence that happens to contain it. "Independent artists and
 * managers" since 2026-11-26, the founder's words. The Label plan is still
 * sold; labels are simply not named in the positioning line.
 */
export const AUDIENCE = ['independent artists', 'managers'] as const;

/** "independent artists and managers", built from the list above. No Oxford comma. */
export const AUDIENCE_LINE = `${AUDIENCE.slice(0, -1).join(', ')} and ${AUDIENCE[AUDIENCE.length - 1]}`;

/** The brand line. The homepage title and the app's default title. */
export const BRAND_LINE = 'Urganize: The operating system for independent music careers';

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
 * The search description: the homepage meta description and JSON-LD. Under
 * 160 characters so Google shows it whole.
 */
export const META_DESCRIPTION = `${CORE_LINE} Plan, coordinate and grow your career as a business, with your team.`;

/**
 * The long description: the positioning in full. Used wherever there is room:
 * the brand page, the AI, the store listing.
 */
export const CANONICAL_DESCRIPTION =
  `${CORE_LINE} It helps ${AUDIENCE_LINE} run their careers as businesses: ` +
  'planning, coordinating and growing the career, not just keeping a task list. ' +
  'Tell it your goals and it makes the plan: releases, shows, pitching, press and distribution. ' +
  'Every task has one owner and one date. It reminds each person, so nobody has to chase.';

/**
 * The link preview: the share card's headline and the title and text
 * WhatsApp, X and LinkedIn show under it.
 */
export const SHARE_HEADLINE = HERO_HEADLINE;
export const SHARE_TITLE = BRAND_LINE;
export const SHARE_DESCRIPTION = CORE_LINE;

/**
 * UrgAns is NOT the product, and this line is the whole of the distinction.
 *
 * It is the AI inside Urganize. When it is asked what it is, it says this.
 * Collapsing the two would make the assistant the product, which is the
 * positioning error every brief since 2026-09-09 has been careful to avoid.
 */
export const URGANS_LINE = 'personal AI for music professionals';
