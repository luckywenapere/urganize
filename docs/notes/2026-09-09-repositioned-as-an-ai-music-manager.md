# Repositioned as an AI Music Manager (2026-09-09, v1.35.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

> **SUPERSEDED 2026-09-24** by "Everything after the music" at the end of this
> file. The machinery described here (one module, a byte-identical homepage
> mirror, the guard, the share card generator) is unchanged and still works the
> way this section says; the strings in it changed, and the product is no
> longer introduced by a category. Read the newer section first.

Founder brief, locked: the product is an **AI Music Manager for artists,
managers and labels**, and the promise is **"Plan, organize and execute
releases from one place."** Applied everywhere a person can read a description
of the product. **No feature work, no pricing change, no data model change** —
copy, metadata, one image and one new doc.

**It consciously REVERSES two rules from the 2026-08-19 executive positioning**
(now marked superseded where it is stated). That brief banned container
metaphors ("one home", "lives in one place") and explicitly ALLOWED the word
"workspace". This one bans "workspace" in anything a person reads and makes
"from one place" the product's own promise. Both reversals are the founder's;
every other rule that brief set still binds — fifth-grade readability, no
Oxford comma in house copy, verbatim customer quotes only.

### The canonical strings live in a module, and it is duplicated on purpose

`apps/web/lib/positioning.ts` holds eight exports and everything else derives
from them. `apps/homepage/lib/positioning.ts` is a byte-identical mirror below
its header comment.

**Why a module rather than the string at each call site:** this repo has
shipped the display-vs-reality gap four times with prices, once with the share
card's alt text against the card's own baked tagline, and twice with a landing
title that existed in two files. Positioning drifts worse than a price does,
because nothing errors — two pages simply describe a different product and
nobody notices for a month.

**Why a duplicate rather than a package:** `apps/homepage` cannot import from
`apps/web` (separate Next apps, no shared path alias), and a package for eight
strings adds an eleventh `package.json` to bump on every release. That is the
trade already recorded for `lib/deploy-version.ts`, whose homepage twin is a
deliberate 20-line copy — and its own note, **"a third consumer is the moment
to promote it"**, applies here unchanged. What makes it safe is that the copy
is not trusted to stay in step by care: the guard strips both files' comments
and fails if a single string differs.

**`AUDIENCE` is a list, not a sentence.** Artists always lead, and the order is
artists, managers, labels, never reordered for emphasis. Keeping it as data
lets the guard pin the ORDER rather than pin one sentence that happens to
contain it.

### Nine things worth knowing before editing any of this

1. **`lib/positioning-guard.test.ts` is what makes the retirement permanent
   rather than a sweep somebody has to repeat.** It walks all of
   `apps/homepage/app` and `apps/homepage/lib`, six named `apps/web` files,
   `README.md` and `docs/store-listing.md`, and fails on twelve retired
   patterns plus "workspace" in any user-readable string. The brief's own step
   5 (a final grep) is a one-off; this is the version that runs on every
   change.
2. **It scans strings, template literals AND JSX text nodes**
   (`lib/copy-scan.ts`, `readableCopy`). Extracting only string literals would
   have missed most of the marketing site, where the copy is prose between
   tags. `userFacingStrings` is lifted from the press-kit copy guard so the two
   share one extractor.
3. **IT HAS TWO BLIND SPOTS, and they are now PINNED BY TESTS rather than
   only documented in a header.** Comments are exempt by design (the press-kit
   guard's own reasoning: the working record holds dates, prose and quotations,
   and holding it to product-copy rules would either gut it or teach everyone
   to work around the test). And a string with no whitespace is treated as an
   identifier, so `aria-label="Workspace"` is invisible to it — three of those
   existed in `AppTopbar` and were found by reading, not by the guard.
   `lib/copy-scan.test.ts` asserts both as deliberate behaviour, because a
   header comment is exactly what somebody closes in good faith; it also pins
   that `readableCopy` COLLAPSES whitespace where the raw readers do not, so a
   phrase split across an interpolation closes up and a verbatim pattern would
   miss it. Every retired pattern is a phrase nobody would interpolate through
   the middle of, which is what makes that acceptable.
4. **`ALLOWED` contains exactly one entry, `'Google Workspace'`**, which is
   somebody else's product name in the MCP setup copy. Anything else added
   there is a hole.
5. **The meta-description check reads the description's OWN EXPRESSION, not
   the file.** This is the one mutation that survived the first pass and it is
   worth knowing why: dropping `${CUSTOMER_LINE}` from a page's description
   passed, because the fallback tested the whole file source and matched the
   leftover `import { CUSTOMER_LINE }` line. It now extracts the expression
   between `description:` and the next known key. Tightening it then
   over-caught seven pages, because `PRODUCT_CATEGORY` had been dropped from
   the allowlist — safe to re-add once only the expression is scanned.
6. **Next's `title.template` applies to CHILD segments only.** So the root
   layout's `"%s | Urganize"` gives every nested page `Page name | Urganize`
   automatically, while `app/page.tsx` renders `BRAND_LINE` alone — which is
   exactly the acceptance criterion (the homepage title is
   "Urganize, AI Music Manager", not "… | Urganize"). `app/download/page.tsx`'s
   own comment already recorded this.
7. **The UrgAns prompt tripped the guard on its own instructions**, and the fix
   is the shape to reuse: telling the model "never call Urganize a workspace"
   puts the banned word in a scanned file. Both rules are consolidated into one
   exported `URGANS_COPY_RULES` and exempted by identity — the
   `bannedCopyInstruction()` precedent. A first attempt split the value on the
   constant and failed, because the constant is a two-literal concatenation and
   the scanner extracts each literal separately; the check is now "the whole
   trimmed value appears in the instruction".
8. **UrgAns is NOT the product, and `URGANS_LINE` is the whole distinction.**
   Asked what Urganize is, it answers with the category; asked what IT is, it
   answers "the personal AI for music professionals inside it". Collapsing the
   two would make the assistant the product, which is the error this brief
   exists to correct.
9. **`SHARE_IMAGE_VERSION` and `SHARE_IMAGE.alt` must move with the card.** The
   version busts the platform caches that do not refetch on a silent file swap
   (URG-156); the alt text is the only machine-readable record of what the
   image says, and the guard reads it, so a regeneration that skipped it fails
   the build.

### The share card has a template now

`apps/homepage/scripts/generate-og-image.mjs` renders the card from `next/og`
and the brand TTFs already checked in for the recap poster, writing the SAME
bytes to both apps' `public/opengraph-image.png` (both reference
`/opengraph-image.png` on their own origin, and a card that disagreed between
the two hosts would be worse than a stale one). **This closes a gap this file
recorded for three weeks** — "a new card needs a founder-approved line and a
`SHARE_IMAGE_VERSION` bump, no template for it exists in the repo".

One trap: `import { ImageResponse } from 'next/og'` throws
`ERR_MODULE_NOT_FOUND` under ESM, because next's exports map does not declare
that subpath for it. `createRequire` + `pathToFileURL(require.resolve(...))`
resolves it.

### Four naming decisions, so they are not re-litigated

- **Settings' "Workspace" tab is "Profile".** Account is you, Profile is your
  team's name, logo and artists, Team is the people. The skeleton's placeholder
  width moved with the label (`w-[79px] sm:w-[83px]` → `w-[66px] sm:w-[70px]`),
  per the loading-skeleton-sync rule.
- **The topbar's "Workspace" controls are "Catalog"**, which is what their own
  icon and action were already called (`CatalogIcon`,
  `CatalogTopbarAction`) — the label was the half that disagreed.
- **`/for-executives` is titled "For roster teams" and KEEPS its route.**
  Renaming routes is out of scope, and a live URL is not a copy decision.
- **The roadmap's "Shipped" label is "Delivered"**, and its `shipped` key is
  untouched — the brief exempts code identifiers.

### What was deliberately left alone

- **The changelog is history** (founder: "leave the changelog entries alone").
  Two entries contain "ship"/"shipped" and stay as written; rewriting a shipped
  ledger entry would falsify the log, which is the same reasoning already
  recorded for the v0.9.0 trial entry.
- **`AUDIT.md`'s one hit is a quotation** of a past keyword brief.
- **Code identifiers, routes, database columns and env vars** containing
  "workspace" — explicitly out of scope, and roughly 120 of the 190-odd hits
  swept were logs, SQL fixtures, CSS class names, storage path prefixes and
  section keys.
- **`apps/homepage` earns no changelog entry**, per the app-only scope rule, so
  v1.35.0's single new highlight covers only the in-app rename. (This work was
  written as v1.33.0 and landed as v1.35.0: two other sessions delivered 1.33.0
  and 1.34.0 while the branch was open, and appending to an already-delivered
  entry would edit a shipped one, so it became its own increment instead.)

### Verified

3039 tests passing / 30 skipped, **23 new** — 10 in `positioning-guard.test.ts`,
12 in `copy-scan.test.ts` and 1 in `system-prompt.test.ts` — against a
**measured** clean-tree baseline of 3016. That baseline was taken by stashing
rather than trusting the 2998 figure an earlier session recorded, which is what
caught that the rebase onto main had brought 18 tests of its own. `eslint .` at
**exactly** the measured 3-error / 81-warning baseline in `apps/web` and its own
0-error / 2-warning baseline in `apps/homepage`, both with zero new findings, `tsc --noEmit` clean apart from the
documented pre-existing `confirmed-action.test.ts` errors, and `next build`
green **by exit code** for both apps with `/auth`, `/onboarding`, `/settings`
and `/dashboard` all still `○ Static`. The built homepage `<title>` was read
out of the prerendered HTML rather than trusted from source. The card was
rendered and looked at: ink ground, cream text, spring accent on the category,
wordmark top left, two lines and nothing else, 1200x630.

**Seven mutation passes**, each killing exactly its own test, and three of them
worth recording: the description-expression fix above; one attempt that **never
applied** (PATTERN NOT FOUND), caught per the standing lesson that a mutation
which never landed is indistinguishable from a survivor and redone against the
exact string; and the two on the extractor itself (dropping the `[^:]` URL guard
from the comment strip, and letting `userFacingStrings` accept a string with no
whitespace), which are the two filters every guard built on it depends on.

Two tests pinned the old copy and were inverted with it
(`email-templates.test.ts`'s "invited you to a workspace",
`team-logins.test.ts`'s "added to a workspace") — the same move
`isContactSalesPlan('label')` made when Label changed meaning.

### One known gap, named rather than quietly widened

**`URGANS_COPY_RULES` tells the model to use no em dashes, and ROLE still
contains 26 of them** in its tool list and guidance sections. Those are strings
this pass did not write: the voice and formatting paragraphs, which are the two
a model would imitate for style, were rewritten without them (the formatting
one is the paragraph the instruction is interpolated into, so it was
demonstrating the punctuation it forbids), and the ROLE opening and the copy
rules themselves are clean. The remaining 26 are appositive dashes inside tool
descriptions, and rewriting them is a mechanical sweep of the
highest-consequence prompt in the app for a rule the brief scopes to strings
touched. Left as the obvious follow-up, with the note that the structural test
asserting every tool name appears in ROLE is what makes such a sweep safe to
attempt.

### Not verified, and it is two of the brief's own steps

**The brief asked for a social card preview and a click-through of login,
onboarding, dashboard, settings and the upgrade modal, with screenshots.
Neither is reachable from here:** this sandbox cannot mint an authenticated
Supabase session, and the agent proxy answers 403 to CONNECT for both urganize
domains, so no social debugger can be asked to fetch the card either. What
stands in for them is the guard, the build, and the card rendered locally.

Worth one pass after deploy: paste the homepage URL into a social debugger and
confirm the new card, then sign in and read the login headline, the onboarding
intro, Settings' Profile tab and the upgrade wall.
