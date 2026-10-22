# The category widened to AI Music Business Manager (2026-09-11)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

> **SUPERSEDED 2026-09-24.** The category line is retired everywhere. UrgAns's
> system prompt kept it for one more day, until 2026-09-25, while the founder
> decided how the assistant describes the product. See "Everything after the
> music" at the end of this file.

Founder call, two days after the 2026-09-09 positioning locked: the product is
an **AI Music Business Manager**, not an AI Music Manager. Nothing else in the
brief moved. The audience order is still artists, managers, labels, the promise
is still "Plan, organize and execute rollouts from one place", and `URGANS_LINE`
is still "personal AI for music professionals" — so this is one constant plus
every place that spells it out by hand.

**No migration, no flag, no API change, and no changelog entry or version bump.**
The app-only scope rule excludes `apps/homepage`, and the `apps/web` half is the
UrgAns prompt plus two `package.json` descriptions, none of which a user can see
as a feature. Production stays at v1.41.0.

**THE MODULE DID MOST OF THE WORK, which is what it was built for.**
`PRODUCT_CATEGORY` is one string, and `BRAND_LINE`, `CUSTOMER_LINE`,
`ONE_LINER`, `SHORT_DESCRIPTION` and the OG card's alt text all compose from it,
so the homepage title, every meta description, all four JSON-LD schemas, the
PWA manifest, the web app's own description and three persona pages followed
without being touched. That is the payoff the file's header predicted when it
argued for a module over a string at each call site.

### Seven things worth knowing

1. **THE ONE FIELD THE CATEGORY NO LONGER FITS IS THE APP STORE NAME, and it
   needs the founder's word before anyone submits.** "Urganize: AI Music
   Business Manager" is 35 characters against a hard 30-character cap that both
   Play and the App Store enforce. `docs/store-listing.md` now carries
   **"Urganize: Music Business AI"** (27) with a ⚠️ note: it keeps all three
   distinctive words, drops only "Manager", and reads as a noun phrase rather
   than a fragment. Every other field on that page carries the category in full.
   This is the only place in the sweep where something had to give.
2. **Every other limit absorbed the nine characters, measured rather than
   assumed.** `ONE_LINER` 50 → 59 (cap 80), `SHORT_DESCRIPTION` 102 → 111 (cap
   160), Apple's promotional text 101 → 110 (cap 170), Play's short description
   50 → 59 (cap 80). The homepage title went 26 → 35, still well inside the ~60
   Google renders whole. **`LANDING_DESCRIPTION` is the tight one: 150 → 159**,
   which is the top of the band its own comment asks for rather than past it, so
   anything added there from now on has to come out of the tail.
3. **THE SEARCH KEYWORDS DID NOT MOVE, and this is the case where that rule is
   hardest to keep.** `LANDING_KEYWORDS[0]` is literally "AI music manager", and
   it was chosen BECAUSE it was the category. It stays anyway, on the precedent
   the same file already records for the two "release" terms that survived the
   rollout rename: these are not read, they are typed into a search box, and
   search volume does not move when we change our own words. The store's tags
   and Apple keywords stay for the same reason, now noted there too.
4. **The OG card was regenerated and looked at, not just re-run.** The headline
   is 68px Fraunces in a 1032px column, so nine more characters genuinely
   changes the wrap — and it improved it: the break now falls exactly at the end
   of the accented category, so the spring-green category gets its own line with
   the cream audience under it. `SHARE_IMAGE_VERSION` is bumped to
   `2026-09-11-business-manager` (platforms cache bytes per URL), and the alt
   text composes from the constants so it followed on its own.
5. **The UrgAns prompt states the category as prose and its test now asserts
   against the constants.** `ROLE` is one block of instruction a person reads
   whole, so it is deliberately not interpolated — which means the test is what
   holds the two in step. It was a literal copy of the old category and it
   FAILED on this change, correctly; it reads `expect(ROLE).toContain(CUSTOMER_LINE)`
   now, so the next widening cannot be forgotten rather than merely remembered.
6. **`/terms` and `/privacy` changed their "Who we are" sentence and did NOT
   bump `LAST_UPDATED`.** Renaming the category we describe ourselves by changes
   nobody's rights or obligations, and a false "the terms have changed" notice
   trains people to ignore the real ones. The 2026-09-09 bump was a billing
   change, which is a different thing.
7. **The brand page's Positioning paragraph is composed from the constants
   now.** It was written out by hand, which meant the one paragraph on the site
   whose entire job is to state the positioning had to be found by grep rather
   than by the compiler. The boilerplate block below it stays as prose, because
   it genuinely differs from `CANONICAL_DESCRIPTION` by a clause.

### Two things fixed in passing

- **`docs/store-listing.md`'s stated character count was already 71 off.** It
  read "1,776 characters" for a block that measured 1,705 before this change and
  1,714 after — the rollout rename shortened it and nobody recounted. Measured
  off the fenced text rather than estimated, and the correction is recorded
  beside it.
- **`lib/seo.ts` said the homepage title "is 26 characters"** and the card
  history stopped at the rollout rename. Both updated; a stale count beside the
  thing it counts is the drift this file keeps having to correct.

### Verified

**3200 tests passing, unchanged** — the count does not move because this changed
what the guards assert rather than adding any. `eslint .` at **exactly** the
measured baselines in both apps (3 errors / 78 warnings in `apps/web`, all three
pre-existing in `WorkspaceView.tsx`; 0 / 2 in `apps/homepage`) with **zero** new
findings. `tsc --noEmit` clean apart from the documented pre-existing
`confirmed-action.test.ts` errors. `next build` green **by exit code** for both
apps, with `/`, `/pricing`, `/brand`, `/terms`, `/privacy`, `/auth`,
`/onboarding`, `/settings` and `/dashboard` all still `○ Static`.

**The acceptance bar was checked against the PRERENDERED HTML rather than the
source**, this repo's habit for any copy change: **zero** occurrences of "AI
Music Manager" survive anywhere in the built marketing site, the new category
renders on every page (31 times on `/` alone, across the h1, the meta tags and
all four JSON-LD schemas), `<title>` reads `Urganize, AI Music Business
Manager`, `og:image:alt` matches the regenerated card, and the `?v=` on the
share image carries the new version. The keywords tag is confirmed **unchanged**,
which is the half that is easy to break by accident.

**Three mutations, each printing `APPLIED` first and each killing exactly its own
tests:** reverting the homepage mirror alone (the byte-identical check), leaving
`CANONICAL_DESCRIPTION` on the old category (the contains-the-category check),
and leaving the UrgAns prompt on the old category (the prompt assertion). All
three files restored byte-identical afterwards, re-verified green.

**Not verified:** nothing has rendered in a browser — this sandbox has no route
to either domain. **The one thing worth a real look is the hero h1**, which
carries `max-w-[20ch]` sized when the category was 16 characters and now holds
25, so at `lg` the accented category itself will probably break across two lines
where it used to sit on one. `text-balance` will even it out and nothing clips,
but whether it reads well is a design call rather than a measurement, and
widening that cap is a one-token change if you want the category on one line.
