# The pricing cards are uniform, and the CTA is "Try Urganize" (2026-09-11)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Two founder asks on the marketing site, in one pass. **No migration, no flag, no
API change, no test change** — and **no changelog entry or version bump**, since
everything a user sees here is `apps/homepage`, which the app-only scope rule
excludes. Production stays at v1.41.0.

**The highlight was the leftover half of the badge removal earlier the same
day.** That pass took the "Most teams" label off both marketing surfaces and
deliberately left `tier.recommended`, whose own doc comment recorded what it
still did: *"leaving this flag to do elevation and CTA emphasis only."* The
elevation is what got reported ("one has a highlight around the border"). It was
exactly **three conditional expressions**, all keyed on that flag — a card
border, a background tint, and the CTA fill. Confirmed by grep: no scale, ring,
shadow, z-index or negative margin anywhere, so the highlight was only ever
colour.

**Five things worth knowing before editing this:**

1. **THE MARKETING SITE NO LONGER READS `tier.recommended` AT ALL, AND THE FLAG
   IS NOT DORMANT.** It stays in `packages/pricing` because `apps/web`'s
   `TierPlanPicker` still renders its badge on the upgrade wall — a separate
   surface and a separate founder call, confirmed again here — and because
   `entitlements.test.ts` pins it to exactly `['solo']`. So the flag is live
   somewhere else, and reaching for it to re-emphasise a marketing card reopens
   what was just closed. Its doc comment now leads with that.
2. **THE CTA CHOICE IS FILLED, AND IT WAS A CHOICE RATHER THAN A DELETION.** The
   two branches differed in box model — the non-recommended one added its own
   `border` — so uniform meant picking one, not dropping a ternary. Filled won
   because `TrialButton` (the site's one primary ask, twelve mounts) and the
   header pill both carry those exact three classes, so it is the site's CTA
   look rather than a per-tier emphasis; the other branch is explicitly the
   de-emphasised treatment, and demoting all three to it would have left
   `/pricing` with **no filled CTA at all** — quieter than today, which is more
   than "uniform" asks for. `TrialButton`'s drop shadow was deliberately not
   taken with it; three shadowed buttons in one card row is a different change.
3. **The interval toggle is deliberately untouched.** Its selected Monthly /
   Yearly pill is a fill, and that is selection feedback — making it uniform
   would mean you cannot tell which interval you are looking at. The founder's
   words point at the cards anyway: the card's was literally
   `border-[var(--marketing-accent)]/50`, a border, where the toggle's is a
   fill. `/pricing`'s hero eyebrow pill (`accent/30`) is likewise unrelated.
4. **THE CTA STRING WAS `"Start free"`, NOT "Start free trial"** — three places
   in this file plus a comment in `PricingPageClient` claimed otherwise, and all
   of them were wrong before this change. Only **three** places render the
   label: `TrialButton.tsx` (covering 12 of the 15 mounts), the hand-rolled
   header pill, and the tier card's `selfServe` ternary.
5. **`start_trial_click` and every `data-location` value are IDENTIFIERS and did
   not move** — the rollout-rename rule that rendered copy changes and
   identifiers do not. They carry GA history, and `LandingAnalytics` returns
   **early and silently** on a mismatch, so breaking one is invisible rather
   than loud. The label and the tracking attribute are fully decoupled: nothing
   derives the event or the location from the button text.

- **The longer label had to pay for itself in the header.** "Try Urganize" costs
  about 20px more than "Start free", and at 375px that row had roughly 15px
  spare — logo (56.9px: a 13px-tall render of a 7726x1766 wordmark) plus
  "Product" plus the CTA plus the theme toggle, with "Log in" already stepped
  aside, against the 327px left once `px-6` is off both sides. So the gaps
  tighten below `sm` only (outer 24 to 12, inner 16 to 12), which gives back the
  same 20px. **Nothing above `sm` changes and nothing wide changes**, because
  with `justify-between` a gap is only a floor — it binds at exactly the tight
  widths and nowhere else. A control added to that row means re-measuring.
- **Left alone deliberately, flagged rather than widened:** three places say
  "Start free" as prose describing the offer rather than as the ask — the
  pricing strip's sub-paragraph, `/pricing`'s hero lead, and
  `docs/store-listing.md` (a never-submitted draft, whose stated `1,776
  characters.` count would need redoing). The request said "CTA", and prose
  describing an offer does not contradict a button that performs it.
- **Verified:** 3200 tests (unchanged — nothing here is testable, and
  `apps/homepage` has no test runner at all), `eslint .` at the exact measured
  baselines in both apps (3 errors / 78 warnings in `apps/web`, 0 / 2 in
  `apps/homepage`) with **zero** new findings, and `next build` green **by exit
  code** with `/` and `/pricing` still `○ Static`. **The proof is in the emitted
  HTML rather than the source**, this repo's habit for any copy or CSS change:
  `uniq -c` over the card wrappers on both surfaces reports **3 against a single
  class string**, and the same over the three card CTAs reports **3 against one
  string** — that is the uniformity, measured. All 21 tracked CTA anchors across
  six pages carry the new label, with the tracking-attribute count unchanged,
  and **zero** anchors still read "Start free". In the compiled CSS the accent
  token now appears at 10% and 30% alpha and **no `/50` rule exists at all**,
  because nothing references it any more.
- **A probe error of my own, since the shape recurs:** the first CSS check
  reported zero references to every class and nearly sent me chasing a
  non-existent bug — it globbed `.next/static/css/`, a directory this build does
  not produce. The stylesheet is at `.next/static/chunks/*.css`, the same place
  `apps/web` keeps it.
- **Not verified:** nothing has rendered in a browser — this sandbox has no
  route to either domain. The header at 375px in particular is arithmetic, not a
  measurement, so it is the one thing worth a real look. Both themes are covered
  by construction rather than by checking: uniformity here comes from deleting
  the conditional, not from matching two colours, so the three cards carry one
  identical class string and cannot differ per palette.
