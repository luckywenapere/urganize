# The audience narrowed to artists and managers (2026-09-11)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

> **REVERSED 2026-09-24: labels are back in the audience.** The founder's long
> description ends "For artists, managers and labels.", so `AUDIENCE` has three
> entries again and the guard's "for labels" and triple patterns are gone ("small
> labels" stays retired). Two things this section did were NOT undone, because
> the brief did not ask: `/for-labels` still redirects to `/pricing`, and the two
> label search keywords were not restored. See "Everything after the music" at
> the end of this file.

Founder call, later on the same day the category widened: the product is for
**artists and managers**, and nothing on the marketing site may say "for
labels" — header, footer, everywhere. Every line that read "AI Music Business
Manager for artists, managers and labels" reads "AI Music Business Manager for
artists and managers" now: the h1, the footer tagline, the share card, every
meta description and JSON-LD schema, the app's own description and manifest,
the UrgAns prompt. The category, the promise and `URGANS_LINE` are untouched,
and artists still lead.

**No migration, no flag, no API change, and no changelog entry or version
bump.** The same class as the category widening earlier that day:
`apps/homepage` is outside the app-only scope rule, and the `apps/web` half is
the shared positioning constants, the UrgAns prompt, a tier subtitle, two
sentences on the team wall and a `package.json` description — none of it a
feature a user can see. Production stays at v1.41.0.

**THE MODULE DID THE WORK AGAIN.** `AUDIENCE` went from three entries to two,
its join already produces "artists and managers" for two items, and so
`CUSTOMER_LINE`, `ONE_LINER`, `SHORT_DESCRIPTION`, the homepage h1
(`HeroSection` renders `{PRODUCT_CATEGORY} for {AUDIENCE_LINE}.`), the footer
tagline, `LANDING_DESCRIPTION` (159 → 151 characters, back inside the band
`seo.ts` asks for), the four JSON-LD schemas, every page description composed
from the constants, the share card's alt text, the web app's `appDescription`
and the PWA manifest all moved with no edit of their own. Only
`CANONICAL_DESCRIPTION` needed a hand rewrite, being prose.

### Three things confirmed with the founder before any code

1. **`/for-labels` is gone**, with its "For labels" Product-menu link, its
   sitemap entry and the two "See Urganize for labels" cross-links on
   `/for-managers` and `/for-executives`. Its URL **redirects to `/pricing`
   with a 307, never a 308**: the page sat in the sitemap at 0.8 for weeks so
   inbound links exist, `/pricing` is where the Label plan it sold still lives,
   and a permanent redirect is cached by the reader's browser forever, which is
   wrong for a copy decision the founder could reverse (the EPK handover's own
   reasoning).
2. **The Label TIER keeps its name and its id.** Only its card subtitle moved
   — "For a label or a team running a roster." became "For a team running a
   roster." — in `packages/pricing`, so `/pricing`, the homepage strip and the
   in-app picker changed together. `BILLING_PLANS.label`, the frozen legacy
   table whose "For labels and managers…" description renders only on the
   flag-off rollback picker, is untouched, and so is the FAQ's "Label has no
   limit".
3. **The category stays "AI Music Business Manager"**; only the audience
   changed. The founder's Title Case ("Artists and Managers") was taken as
   dictation rather than as a style change: house copy is sentence case, and
   the h1 and the footer already rendered the audience lowercase.

### Seven things worth knowing before editing any of this

1. **Three RETIRED patterns hold it in place** in
   `lib/positioning-guard.test.ts`: `/artists, managers and labels/i`,
   `/\bfor labels\b/i` and `/small labels/i`. That guard reads `README.md` and
   `docs/store-listing.md` as RAW prose, and it bit within the hour: the store
   listing's own header said "(founder call: it is not for labels)" and failed
   the build. Reworded to "labels are no longer an audience". A sentence ABOUT
   a retirement has to avoid the retired phrase — the constraint
   `URGANS_COPY_RULES` already lives under.
2. **Two SEO keywords left with the audience, and that is the A&R rule, not
   the category rule.** `"label management software"` and `"record label
   software"` are out of `LANDING_KEYWORDS`, and `label` is out of the Apple
   keywords in the store listing. A CATEGORY rename keeps its keywords because
   the searcher still types the old word (the reason "AI music manager"
   survived the widening that same morning); a keyword that recruits an
   AUDIENCE the brief no longer names sends the wrong person to a page that
   tells them so — which is exactly why `"A&R software"` went when that
   audience did. Both comments say so beside their lists.
3. **The share card was regenerated and LOOKED AT.** `MAIN_LINE` in
   `generate-og-image.mjs` is eight characters shorter, the break still falls
   exactly at the end of the accented category (spring-green category on one
   line, cream "for artists and managers." on the next), and the script wrote
   identical bytes to both apps' `public/opengraph-image.png` (md5 checked).
   `SHARE_IMAGE_VERSION` is `2026-09-11-artists-and-managers`; the alt
   composes from the constants and followed on its own.
4. **`/pricing`'s hero is composed from the constants now**, the `/brand`
   Positioning-paragraph pattern: `Urganize is an {CUSTOMER_LINE}.` and
   `Built for {AUDIENCE_LINE}.` It was the one marketing page that spelled the
   whole customer line out by hand, so it had to be found by grep on the
   widening AND on this narrowing; it follows the module next time.
5. **The other hand-written copies are the sweep, and the list is the reusable
   part:** `/terms` and `/privacy` "Who we are" (`LAST_UPDATED` NOT bumped —
   renaming who we say we are for changes nobody's rights, the same call as the
   widening), `/signup`'s target-user paragraph, `/community`'s description,
   `/brand`'s "Who it's for" and its press boilerplate, the two `TeamWall`
   sentences in the app ("Running a bigger roster, or prefer an invoice?"),
   `README.md`, `PROJECT_SUMMARY.md`, `REFACTOR_NOTES.md`, the four
   `package.json` descriptions, and the UrgAns `ROLE`, whose test asserts
   `toContain(CUSTOMER_LINE)` and failed correctly until it moved.
6. **Left alone, deliberately:** the tier name and id; `WaitlistForm.tsx`'s
   "Label manager" option (a respondent's self-description feeding a stored
   enum, not positioning copy); `/for-ai-artists`' "Nothing assumes a label, a
   budget or a team of ten", which says the opposite of "for labels";
   `/for-executives` ("for teams running a roster"), which keeps its route;
   `/brand`'s "Small uppercase labels in the mono font" (typography, and it does
   not match `small labels`); the `/changelog` history; and the "Target user
   for v1" paragraph at the top of this file, which is the record of the build
   scope rather than positioning.
7. **The store listing's stated counts were remeasured with `wc -m`**, per
   that file's own rule: short description 51, promotional text 103, Apple
   keywords 87 → 82, and the full description **1,714 → 1,656** — the second
   recount that day, since the rollout rename had already left the previous
   figure 71 stale. The 30-character app name is unaffected.

### Verified

3200 tests passing / 30 skipped — the same count as before, because
assertions and patterns changed and no case was added — with the guard, the
byte-identical mirror check and the UrgAns prompt assertion all green.
`eslint .` at the exact measured baselines in both apps (3 errors / 78 warnings
in `apps/web`, all three the pre-existing `WorkspaceView.tsx` ref reads; 0 / 2
in `apps/homepage`), `tsc --noEmit` clean apart from the documented
pre-existing `confirmed-action.test.ts` errors, and `next build` green **by
exit code** for both apps: `/for-labels` absent from the route list and from
the built `sitemap.xml`, and `/auth`, `/onboarding`, `/settings`, `/dashboard`
and `/locked` all still `○ Static`.

**The acceptance bar was checked against the PRERENDERED HTML rather than the
source:** "managers and labels", "for labels", "small labels" and both dropped
keywords appear **zero** times across every built page outside `/changelog`;
the `/` h1 reads exactly "AI Music Business Manager for artists and managers.";
the footer tagline carries the new line on 21 of 22 pages (the exception is
`_global-error.html`, which has no footer); the keywords meta has five terms;
all four JSON-LD descriptions on `/` carry the new line; `og:image` carries the
new version and the new alt; and the Label card reads "For a team running a
roster." On `next start`, `curl -sI /for-labels` answers **307** with
`location: /pricing`, and `/pricing` answers 200.

**And rendered, this time, in a real headless Chromium against the built
site:** `/` at 1280 in both themes and at 375, `/pricing` at 1280, and the
footer at both widths. The h1 breaks as "AI Music Business / Manager for
artists / and managers." at 1280 and at 375 — the same three-line shape the
longer line had, so `max-w-[20ch]` needed no change; the footer tagline is one
line at 1280 and two at 375 (a 51-character sentence at that size cannot be
one, and the 59-character one before it was two as well); no horizontal
overflow on `/` or `/pricing` at 375.

### Not verified

The live site, until the deploy lands — this sandbox has no route to either
urganize domain. Worth one pass after: paste the homepage URL into a social
debugger and confirm the new card, open `/for-labels` and confirm it lands on
`/pricing`, and read the wall in the app for the two reworded sentences.
