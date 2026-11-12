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
 * POSITIONING SINCE 2026-11-09 (founder, issue #1153): "Urganize is an app that
 * helps artists, managers and record labels plan new music and keep track of
 * every task. It asks about your goals, then makes a plan that fits. You can
 * also make your own. Use it solo or with a team. After every task, Urganize
 * asks how it went..." The founder's last clause, "so it keeps learning from
 * you", was swapped for "so you can see what worked when the release is out"
 * (founder approved): the answers feed the post-release review, and nothing
 * yet feeds them back into the next plan. Put "keeps learning" back only once
 * the planner reads task outcomes.
 *
 * Retired the same day: "From idea to execution." (2026-10-31 to 2026-11-09),
 * "where music teams manage everything from idea to execution", the hero
 * promise "Everyone knows their job till drop day. Nobody has to chase
 * anybody." and "Built for artists and their teams.". Their history is in git.
 */

/**
 * The core line without its subject, for a sentence that already names
 * Urganize ("Urganize, an app that helps...", "inside Urganize, an app that
 * helps...").
 */
export const CORE_CLAUSE =
  'an app that helps artists, managers and record labels plan new music and keep track of every task';

/** The core line, the founder's words. Introduces the product anywhere a whole sentence fits. */
export const CORE_LINE = `Urganize is ${CORE_CLAUSE}.`;

/**
 * The short line. Page titles, meta titles, tight bios, the footer, the share
 * card. Founder approved 2026-11-09.
 */
export const SHORT_LINE = 'Plan new music. Track every task.';

/**
 * The homepage headline. Coframe's test, accepted by the founder 2026-11-12
 * (#1224): name the job and who it is for in the headline itself, because
 * "Tell it your goals. Get a plan that fits." never said what gets planned.
 * The old headline lives on as HERO_EYEBROW, the line above it.
 */
export const HERO_HEADLINE = 'Plan your next release, task by task.';

/** The line above the headline: the 2026-11-09 headline, kept as Coframe advised. */
export const HERO_EYEBROW = 'Tell it your goals. Get a plan that fits.';

/**
 * The line under the headline (Coframe, #1224). Coframe wrote "until it
 * ships"; the house word is never "ship", so it says "until it's out".
 */
export const HERO_SUBHEAD =
  "Urganize builds a release plan for artists, managers and record labels, then tracks every task until it's out.";

/**
 * The line under the headline: the rest of the positioning in one breath.
 * Founder approved 2026-11-09.
 */
export const PROMISE_LINE = 'Or make your own. Use it solo or with your team, and keep track of every task.';

/**
 * The learning loop, in words that are true today: the "how did it go?" sheet
 * after a task is live, and its answers feed the post-release review.
 */
export const LEARNING_LINE =
  'After every task, Urganize asks how it went, so you can see what worked when the release is out.';

/**
 * Who it is for, in the fixed order artists, managers, record labels.
 *
 * ARTISTS ALWAYS LEAD, and the order is never reordered for emphasis. It is
 * data rather than a baked string so the guard can pin the order rather than
 * pin one sentence that happens to contain it. "Record labels" since
 * 2026-11-09, the founder's word.
 */
export const AUDIENCE = ['artists', 'managers', 'record labels'] as const;

/** "artists, managers and record labels", built from the list above. No Oxford comma. */
export const AUDIENCE_LINE = `${AUDIENCE.slice(0, -1).join(', ')} and ${AUDIENCE[AUDIENCE.length - 1]}`;

/** The brand line. The homepage title and the app's default title. */
export const BRAND_LINE = 'Urganize: Plan new music, track every task';

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
 * 160 characters so Google shows it whole. Founder approved 2026-11-09.
 */
export const META_DESCRIPTION =
  'Urganize helps artists, managers and record labels plan new music and keep track of every task. ' +
  'Tell it your goals and it makes a plan that fits.';

/**
 * The long description: the founder's positioning in full, with the learning
 * line in its true form. Used wherever there is room: the brand page, UrgAns,
 * the store listing.
 */
export const CANONICAL_DESCRIPTION =
  `${CORE_LINE} It asks about your goals, then makes a plan that fits. ` +
  'You can also make your own. Use it solo or with a team. ' +
  LEARNING_LINE;

/**
 * The link preview: the share card's headline and the title and text
 * WhatsApp, X and LinkedIn show under it.
 */
export const SHARE_HEADLINE = SHORT_LINE;
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
