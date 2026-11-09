import { readFileSync, readdirSync, statSync } from 'fs';
import { join, sep } from 'path';
import { describe, expect, it } from 'vitest';
import { URGANS_COPY_RULES } from './chappi/system-prompt';
import { readableCopy } from './copy-scan';
import {
  AUDIENCE,
  AUDIENCE_LINE,
  BRAND_LINE,
  CANONICAL_DESCRIPTION,
  CORE_CLAUSE,
  CORE_LINE,
  ONE_LINER,
  PROMISE_LINE,
  SHARE_DESCRIPTION,
  SHARE_HEADLINE,
  SHARE_TITLE,
  SHORT_DESCRIPTION,
  SHORT_LINE,
  URGANS_LINE,
} from './positioning';

/**
 * The positioning, enforced rather than reviewed.
 *
 * Since 2026-10-17: Urganize is where music teams plan every release and
 * deliver it on time ("Every release, on plan."). It said "do everything
 * after the music is made" from 2026-09-24, and that brief retired the category the product had been
 * introduced by since 2026-09-09 ("AI Music Business Manager"), and every
 * earlier brief retired phrases of its own. They all ask for zero hits in
 * "any user-facing string, meta tag, doc, image or store listing": an
 * acceptance criterion that is a grep today and rots the moment somebody
 * writes a new page. This is that grep, kept.
 *
 * IT RUNS OVER BOTH APPS. `apps/homepage` has no test runner of its own
 * (vitest is configured in `apps/web` only), and the marketing site is where
 * most of the retired copy lived, so this file reaches across the workspace by
 * path. That is the same thing `lib/vercel-ignore-build.test.ts` and
 * `lib/posthog-proxy.test.ts` already do for `next.config.js`.
 *
 * WHAT IT CANNOT SEE, said plainly, because a guard that reads as total and is
 * not is worse than one whose gaps are written down:
 *
 *  - **Comments.** Exempt by design (see lib/copy-scan.ts). The history of a
 *    decision is allowed to quote the phrase the decision retired, and several
 *    comments in this repo now do exactly that.
 *  - **Single words.** `copy-scan` treats a string with no whitespace as an
 *    identifier, so `aria-label="Workspace"` is invisible to it. Those were
 *    found by reading and fixed by hand; a future one will need the same.
 *  - **Images.** The OG card's text is baked into a PNG. `seo.ts` carries its
 *    alt text as the machine-readable stand-in, and that IS covered here, so a
 *    card regenerated without its alt updated fails.
 *  - **Anything outside SURFACES below.** The list is explicit rather than a
 *    walk of the whole repo, because the repo is full of legitimate uses:
 *    `workspaces` is a database table, `workspace:*` is the pnpm protocol, and
 *    "Google Workspace" is a real subprocessor.
 */

const WEB = join(__dirname, '..');
const HOMEPAGE = join(WEB, '..', 'homepage');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/**
 * Paths with forward slashes, whatever the platform.
 *
 * `join` emits backslashes on Windows, and several filters below match on
 * `/` — `//page.tsx$/`, `!//components//`. On Windows those matched
 * NOTHING, so "gives every marketing page a description that names the
 * category" failed with `expected 0 to be greater than 15` on a clean tree:
 * the guard could not see a single page. It passed in CI and failed on the
 * founder's own machine, which is the worst shape a guard can have — a test
 * that always fails locally is a test people learn to skip.
 *
 * Node reads a forward-slash path on Windows perfectly well, so normalising
 * here costs nothing and fixes the whole class rather than the one filter that
 * happened to be noticed.
 */
const posix = (path: string) => path.split(sep).join('/');

const isSource = (path: string) =>
  /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path);

/**
 * Every surface a person can read a description of the product on.
 *
 * The marketing site is walked whole: every page on it introduces the product
 * to somebody who has never seen it, so there is no page there that is exempt.
 * The product app is named file by file, because most of it is copy about a
 * release rather than about Urganize, and the older surfaces predate these
 * rules the way the press-kit guard's header describes.
 */
const SURFACES = [
  ...walk(join(HOMEPAGE, 'app')).filter(isSource),
  ...walk(join(HOMEPAGE, 'lib')).filter(isSource),
  join(WEB, 'app', 'layout.tsx'),
  join(WEB, 'app', 'manifest.ts'),
  join(WEB, 'lib', 'positioning.ts'),
  // The customer-facing email copy. Was lib/email-templates.ts until the
  // 2026-09 react-email split moved every template into its own file; the
  // founder billing alert is internal (a lead sheet to the founder, not a
  // customer) and stays out, the way billing-alert-templates.ts always did.
  join(WEB, 'lib', 'email', 'templates', 'Layout.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'components.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'WelcomeEmail.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'WorkspaceInviteEmail.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'CreditSubmissionEmail.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'TaskAssignedEmail.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'WorkRequestEmail.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'WorkRequestAnswerEmail.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'ReferralRewardEmail.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'ReleasePaybackQuestionEmail.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'NotifyAdminEmail.tsx'),
  // The onboarding sequence (2026-09-30): the five emails' words live in
  // onboarding-sequence.ts, laid out by the founder-note templates.
  join(WEB, 'lib', 'email', 'onboarding-sequence.ts'),
  join(WEB, 'lib', 'email', 'templates', 'FounderNote.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'OnboardingStepEmail.tsx'),
  join(WEB, 'lib', 'email', 'templates', 'AnnouncementEmail.tsx'),
  join(WEB, 'lib', 'chappi', 'system-prompt.ts'),
  join(WEB, 'lib', 'help-copy.ts'),
];

/** Docs and READMEs are markdown, so they are read as raw text rather than
 * scanned for string literals. The brief names them explicitly. */
const PROSE = [
  join(WEB, '..', '..', 'README.md'),
  join(WEB, '..', '..', 'docs', 'store-listing.md'),
];

/**
 * The retired phrases, as patterns.
 *
 * `workspace` is the one that needs care: it is banned in anything a user, a
 * visitor or an app store reviewer can read, while code identifiers, routes,
 * database columns and env vars keep it. That distinction is why this scans
 * extracted strings rather than raw source.
 */
const RETIRED = [
  /AI workspace for music/i,
  /music professionals, collectives and record labels/i,
  /collectives and record labels/i,
  /release management/i,
  /music executives/i,
  /label heads/i,
  /A&R directors?/i,
  /operation heads/i,
  /\bVP Operations\b/i,
  /music rollouts/i,
  /Global standard, from here/i,
  /\bLet['’]s build\b/i,
  /\bworkspaces?\b/i,
  // 2026-09-11 retired "small labels", the artists-managers-labels triple and
  // "for labels". The 2026-09-24 brief brought the last two back, and
  // "small labels" followed on 2026-10-02: the strategy doc names small labels
  // among the teams we sell to (section 1), so the site may say it too.
  // 2026-09-24: the category and the lines that went with it. "AI Music
  // Manager" is matched CASE-SENSITIVELY on purpose: the title-cased form is
  // how the category was written in copy, while the lowercase search keyword
  // "AI music manager" was kept in LANDING_KEYWORDS (until the 2026-10-18
  // artist-managers-first list) and the store tags, because nobody's search
  // habits changed when our wording did.
  /\bAI Music Manager\b/,
  /Music Business AI/i,
  /operating system for music/i,
  /plan, organize and execute/i,
  // The category itself. Retired everywhere on 2026-09-24 except UrgAns's
  // system prompt, which kept saying it while the founder decided how the
  // assistant describes the product. He decided on 2026-09-25 (the new line,
  // like everything else), so the one-file exemption and the test that
  // guarded it are gone and this is an ordinary retired phrase now.
  /AI Music Business Manager/i,
  // 2026-10-17 (URG-344): the 2026-09-24 short line and core line, replaced by
  // "Every release, on plan." and "plan every release and deliver it on time".
  /everything after the music/i,
  // 2026-10-31 (#944): the 2026-10-17 short line and core line, replaced by
  // "From idea to execution." and "manage everything from idea to execution".
  // "On plan" alone stays allowed where it describes a plan.
  /every release, on plan/i,
  /plan every release and deliver it on time/i,
  // 2026-11-09 (#1153): the 2026-10-31 core clause, replaced by "an app that
  // helps artists, managers and record labels plan new music and keep track of
  // every task". The short line "From idea to execution." stays allowed.
  /manage everything from idea to execution/i,
] as const;

/**
 * Strings that legitimately contain a retired pattern, exempted by identity
 * rather than by a loosened pattern.
 *
 * Kept deliberately short. Every entry is a case where the phrase is somebody
 * else's proper noun or a legal description of a third party, never our own
 * copy about our own product.
 */
const ALLOWED = new Set([
  // A real subprocessor's product name (apps/homepage/app/subprocessors).
  'Google Workspace',
]);

/**
 * Drop snake_case identifiers before testing prose.
 *
 * The brief exempts code identifiers, and two of them are unavoidably quoted
 * inside a sentence a person reads: UrgAns's system prompt lists its own tool
 * names, `list_workspace_members` and `get_workspace_context` among them.
 * Renaming those is explicitly out of scope, so the guard has to be able to
 * tell an identifier from a noun. An underscore is a reliable tell: prose in
 * this product does not contain one.
 */
const withoutIdentifiers = (value: string) =>
  value
    .replace(/\b\w*_\w*\b/g, ' ')
    // A filename is an identifier too: `pnpm-workspace.yaml` is pnpm's own
    // file and renaming it would break the monorepo.
    .replace(/\S+\.(?:yaml|yml|json|tsx?|mjs|cjs|md|png|svg|sql|css)\b/g, ' ');

/**
 * The one instruction that is ALLOWED to name a retired word.
 *
 * UrgAns's prompt has to be able to say "never call Urganize a workspace" and
 * "never shipped" for the model to obey either rule. That instruction is
 * exported as a single constant so it can be exempted by identity here rather
 * than by loosening a pattern, which is the same trick the press-kit guard
 * plays with `bannedCopyInstruction()`.
 *
 * Matched as a FRAGMENT rather than the whole string, because the constant is
 * built by concatenating two literals and the scanner extracts each one
 * separately. Anything wholly contained in the instruction is part of the
 * instruction.
 */
const isCopyRulesFragment = (value: string) =>
  value.trim().length > 0 && URGANS_COPY_RULES.includes(value.trim());

const report = (path: string, value: string) =>
  `${path.replace(`${join(WEB, '..', '..')}/`, '')}: ${value}`;

describe('positioning', () => {
  it('finds the surfaces it is meant to be guarding', () => {
    // A walk that silently matched nothing would pass every test below. The
    // marketing site alone is over twenty pages.
    expect(SURFACES.length).toBeGreaterThan(25);
  });

  it("says the founder's three lines, word for word", () => {
    // The 2026-09-24 brief gave these verbatim. Pinned as literals, not
    // against the module's own parts, because what matters is that the words
    // are the founder's rather than that the module agrees with itself.
    // Both say "music teams" since 2026-10-02, the strategy doc's wording
    // (founder call); they said "your team" from 2026-09-24.
    // Since 2026-10-17 (founder approved the homepage v2 hero, URG-334) the
    // short line, the brand line and the long description say "Every
    // release, on plan." and the promise line is the hero's subhead. The core
    // line followed the same day (URG-344): "plan every release and deliver it
    // on time" replaced "do everything after the music is made".
    // Since 2026-10-31 (founder approved, #944): "From idea to execution."
    // and "manage everything from idea to execution", after the link preview
    // took them first (#939). The promise line stays as the hero's subhead.
    // Since 2026-11-09 (founder positioning, #1153) the core line and the long
    // description are his new words; the short line and promise stay.
    expect(CORE_LINE).toBe(
      'Urganize is an app that helps artists, managers and record labels plan new music and keep track of every task.',
    );
    expect(SHORT_LINE).toBe('From idea to execution.');
    expect(PROMISE_LINE).toBe('Everyone knows their job till drop day. Nobody has to chase anybody.');
    // 2026-10-27 (founder approved): artists and their teams, not managers
    // alone, so the promise and the long description drop "reminder app".
    // 2026-10-18 (founder approved): the long description leads with artist
    // managers, the buyer, and names them as its own last sentence.
    expect(CANONICAL_DESCRIPTION).toBe(
      'Urganize is an app that helps artists, managers and record labels plan new music and keep track of every task. ' +
        'It asks about your goals, then makes a plan that fits. You can also make your own. ' +
        'Use it solo or with a team. After every task, Urganize asks how it went, so it keeps learning from you.',
    );
    expect(CORE_LINE).toBe(`Urganize is ${CORE_CLAUSE}.`);
    expect(BRAND_LINE).toBe('Urganize: From idea to execution');
    expect(URGANS_LINE).toBe('personal AI for music professionals');
  });

  it('leads the audience with artists, every time', () => {
    // Artists always lead the audience list. Pinned as the list rather than as
    // a sentence containing it, so a reorder fails here rather than in review.
    // Labels were dropped on 2026-09-11 and came back on 2026-09-24 with the
    // founder's long description; artists led both times.
    // "Record labels" since 2026-11-09 (#1153).
    expect([...AUDIENCE]).toEqual(['artists', 'managers', 'record labels']);
    expect(AUDIENCE_LINE).toBe('artists, managers and record labels');
    // The long description stopped composing this list on 2026-10-18: it is
    // built for artist managers, and says so in its own words.
  });

  it('fits the limits other platforms enforce', () => {
    // Under 80 for a bio or an OG line, under 160 for a manifest or a store
    // field. Past either, the platform truncates mid-phrase and the
    // positioning is the half that gets cut.
    expect(ONE_LINER.length).toBeLessThan(80);
    expect(SHORT_DESCRIPTION.length).toBeLessThan(160);
    // Every short-form line says the one idea, so no surface can quote a
    // line that forgot it. (The core line keeps its own wording.)
    // The long description stopped carrying it on 2026-11-09 (#1153): it is the
    // founder's new positioning word for word.
    for (const line of [SHORT_LINE, BRAND_LINE]) {
      expect(line.toLowerCase()).toContain('from idea to execution');
    }
    expect(PROMISE_LINE.length).toBeLessThan(80);
  });

  it('says the founder\'s link preview line (#939)', () => {
    // The share card, og:title and og:description. Their own strings for a day
    // (#939); since #944 they are the short line, brand line and core line.
    expect(SHARE_HEADLINE).toBe('From idea to execution.');
    expect(SHARE_TITLE).toBe('Urganize: From idea to execution');
    expect(SHARE_DESCRIPTION).toBe(
      'Urganize is an app that helps artists, managers and record labels plan new music and keep track of every task.',
    );
    // Short enough that WhatsApp and X show the description whole. 120 since
    // 2026-11-09 (#1153): the founder's core line is 111 characters and is
    // used word for word rather than cut to fit the old 100.
    expect(SHARE_DESCRIPTION.length).toBeLessThan(120);
  });

  it('uses no em dash in the positioning itself', () => {
    for (const line of [
      CORE_CLAUSE,
      CORE_LINE,
      SHORT_LINE,
      PROMISE_LINE,
      AUDIENCE_LINE,
      BRAND_LINE,
      ONE_LINER,
      SHORT_DESCRIPTION,
      CANONICAL_DESCRIPTION,
      URGANS_LINE,
      SHARE_HEADLINE,
      SHARE_TITLE,
      SHARE_DESCRIPTION,
    ]) {
      expect(line).not.toContain('—');
      expect(line).not.toContain('–');
    }
  });

  it('keeps the homepage mirror byte-identical below its header', () => {
    // apps/homepage cannot import from apps/web, so the strings exist twice.
    // This is what makes that safe: everything but the comments must match, so
    // a string edited on one side and not the other fails the build instead of
    // giving the marketing site and the product two different descriptions.
    const strip = (source: string) =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim())
        .join('\n');

    const mine = strip(readFileSync(join(WEB, 'lib', 'positioning.ts'), 'utf8'));
    const theirs = strip(readFileSync(join(HOMEPAGE, 'lib', 'positioning.ts'), 'utf8'));
    expect(theirs).toBe(mine);
  });

  it('has retired every phrase the brief retires', () => {
    const found: string[] = [];

    for (const path of SURFACES) {
      for (const value of readableCopy(readFileSync(path, 'utf8'))) {
        if (ALLOWED.has(value) || isCopyRulesFragment(value)) continue;
        const prose = withoutIdentifiers(value);
        const hit = RETIRED.find((pattern) => pattern.test(prose));
        if (hit) found.push(report(path, `${hit} in "${value}"`));
      }
    }

    expect(found).toEqual([]);
  });

  it('has retired every phrase in the docs the brief names', () => {
    const found: string[] = [];

    for (const path of PROSE) {
      const text = readFileSync(path, 'utf8');
      // Markdown has no comments to strip and no identifiers to skip: every
      // line of it is read by a person.
      for (const line of text.split('\n')) {
        const hit = RETIRED.find((pattern) => pattern.test(withoutIdentifiers(line)));
        if (hit) found.push(report(path, `${hit} in "${line.trim().slice(0, 90)}"`));
      }
    }

    expect(found).toEqual([]);
  });

  it('says deliver, never ship, on the surfaces it guards', () => {
    // "Release" is the unit and it is DELIVERED. The press-kit guard already
    // holds its own files to this; the brief widens it to the marketing site,
    // which had four hits including a "ships a release" feature blurb.
    const found: string[] = [];
    for (const path of SURFACES) {
      for (const value of readableCopy(readFileSync(path, 'utf8'))) {
        if (isCopyRulesFragment(value)) continue;
        if (/\b(ship|ships|shipped|shipping)\b/i.test(withoutIdentifiers(value)))
          found.push(report(path, value));
      }
    }
    expect(found).toEqual([]);
  });

  it('gives every marketing page a description that says what Urganize is', () => {
    // The brief's acceptance criterion, and the one most likely to rot: a new
    // page is easy to add without a description, and nothing else would notice.
    const pages = walk(join(HOMEPAGE, 'app')).map(posix).filter(
      (path) => /\/page\.tsx$/.test(path) && !/\/components\//.test(path),
    );
    expect(pages.length).toBeGreaterThan(15);

    const missing: string[] = [];
    for (const path of pages) {
      const source = readFileSync(path, 'utf8');
      // A page either builds its own metadata or is a nested route that
      // legitimately inherits it. Only the ones that declare a description are
      // checked, and a declared one has to carry the positioning: "from idea
      // to execution" (since #944), in words or through a shared constant.
      //
      // THE DESCRIPTION'S OWN EXPRESSION IS WHAT IS TESTED, not the file. An
      // earlier version scanned the whole source for a constant name and
      // passed on the leftover `import { CUSTOMER_LINE }` after the
      // description itself had stopped using it — found by mutation, which is
      // the only way that kind of hole shows up.
      const declared = /\bdescription:\s*([\s\S]*?),\s*\n\s*(?:path|noIndex|title|openGraph|\})/.exec(
        source,
      );
      if (!declared) continue;
      const expression = declared[1];
      const declaresPositioning =
        /from idea to execution/i.test(expression) ||
        // The founder's 2026-11-09 core line, in words (#1153).
        /plan new music and keep track of every task/i.test(expression) ||
        // Composed from the shared constants rather than written out.
        /\b(?:CORE_LINE|CORE_CLAUSE|SHORT_LINE|PROMISE_LINE|SHORT_DESCRIPTION|CANONICAL_DESCRIPTION|ONE_LINER|LANDING_DESCRIPTION)\b/.test(
          expression,
        );
      if (!declaresPositioning) missing.push(report(path, 'description does not say what Urganize is'));
    }
    expect(missing).toEqual([]);
  });
});
