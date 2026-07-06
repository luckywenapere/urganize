# Urganize Homepage Audit

Marketing site confirmed at `apps/homepage` (separate Next.js app, separate Vercel project, builds independently of `apps/web`). Pages audited: `/`, `/features`, `/pricing`, `/press`, `/team`, `/privacy`, `/terms`, `/subprocessors`. `/admin/waitlist` and `/dashboard/*` are internal, cookie-gated, already `robots: { index: false, follow: false }` — excluded from copy/SEO scope, flagged only where relevant.

**Status: Phase 1 (audit) and Phase 2 (implementation) both complete.** Resolutions below; the open questions section underneath is kept as the historical record of what was asked and why.

## Resolutions (owner decisions, applied)

1. **Chappi wedge feature — write as "coming soon."** Not live in the product today. `/features` now has a clearly-labeled, subtly-styled "Coming soon" block (`comingSoon` const in `features/page.tsx`) describing Chappi drafting the cover-art brief, with an explicit "In development, not live yet" point. It is not the hero's proof point — the hero and homepage lead with shipped features only.
2. **ICP — blend, and fix Antoine's testimonial to match.** Antoine manages other artists in addition to himself; his quote (verbatim, untouched — sign-off protection preserved) stays, but his byline changed from "Independent Artist & Manager" to "Artist Manager" to stop reading as a solo self-manager. Hero eyebrow changed to "Labels and artist managers," hero subhead and several body copy blocks now say "freelance team" (supportable today via task assignment to A&R/PR/designer/distributor, even though those collaborators need accounts — only the *no-account* claim was blocked by open question #1).
3. **Legal entity — leave as-is (Nigerian Ltd).** Did not touch Terms/Privacy/footer. The brief's "Delaware C-Corp" framing was not applied anywhere, including JSON-LD: `Organization.legalName` in `layout.tsx` is set to "The Urganization Ltd."
4. **Testimonial sign-off — confirmed fine.** No changes to quote text or removal of any testimonial.
5. **Em dashes — removed where removable, kept where they're doing real work.** ~40 rendered (non-comment) em dashes across the site restructured into commas/periods/colons with zero meaning change, including a punctuation-only pass on `/privacy` and `/terms` (no substantive legal wording touched). Decorative bullet-marker dashes (the `<span aria-hidden>—</span>` glyphs used as list bullets throughout `/features`) were left alone — they're a design element, not the prose em-dash pattern the brand rule targets.
6. **SEO/technical — fix all.** See Phase 1b/1c below; every item listed there as a gap has been closed (canonical tags, full sitemap, per-page OG/Twitter, `SoftwareApplication` + `FAQPage` JSON-LD, `/pricing` metadata, dark-theme manifest colors, branded 404, redundant OG image deleted, robots.txt date refreshed). The one exception: the YouTube hero-embed lazy-load facade was **not** implemented — it's a visible-behavior change and the brief explicitly excludes layout/design changes; flagging it again here as a good follow-up outside this task's scope.

Shipped as two commits: `feat(homepage): technical SEO foundation` (infra: sitemap, robots.txt, manifest, 404, seo helper, deleted duplicate image) and `feat(homepage): per-page metadata, structured data, and copy pass` (metadata wiring, JSON-LD, all copy changes). Verified with `pnpm build` and `pnpm lint` (0 errors) across the whole workspace, plus a spot-check of the built HTML output for titles, canonical tags, JSON-LD, and the copy changes.

---

## Open questions (asked before Phase 2 — see Resolutions above for answers)

**1. The wedge feature ("Chappi") does not exist in the product.** The brief's proof point is Chappi drafting a cover-art brief, the designer reviewing and approving in a thread, and never needing an account. I searched the full repo and git history for "Chappi," "artwork brief," and "cover art approval" — zero matches. `CLAUDE.md` (the product's own source-of-truth doc) lists exactly two AI integration points for v1 — a release rollout planner and a status-update generator — and explicitly states "no more" AI features and no AI chat/assistant. There's also no no-account collaborator flow: the only invite path (`apps/web/app/invite/accept/page.tsx`) requires the invitee to create a full account before they can see anything. **I cannot write homepage copy asserting this feature exists.** Is this: (a) a v2 feature being pre-announced (then copy needs "coming soon" framing, not present-tense claims), (b) an illustrative example in the brief not meant to be taken literally, or (c) real work that exists somewhere I don't have visibility into? This blocks the wedge-feature section of Phase 2 entirely until resolved.

**2. ICP mismatch: brief wants multi-artist labels/managers running a freelance team; current copy speaks to solo self-managers.** The homepage's hero testimonial is Antoine: *"I manage myself, so every dropped ball is mine."* That's a single artist managing themselves, not a manager running a freelance team across multiple artists. The product does support a "Label" pricing tier and a "guest" workspace role, so the multi-artist ICP is real, but the current homepage doesn't speak to it. Confirm you want the primary framing to shift toward labels/multi-artist managers even though today's only public testimonials are from single-artist self-managers — or whether the testimonials need to be recontextualized/deprioritized rather than kept as the emotional core of the page.

**3. Legal entity name conflicts with the brief, and it's substantive legal content I'm told not to touch.** The brief states the company is "The Urganization, Inc. (Delaware C-Corp, Nigerian subsidiary in Abuja)." The live Privacy Policy, Terms of Service, and site footer all say **"The Urganization Ltd, a company registered in Nigeria"**, with Nigerian governing law and Nigerian court jurisdiction in the Terms. These are not the same entity structure. Per your own instruction I won't touch legal pages' substantive content or the footer's copyright line without a decision from you — but I need to know which is currently correct so I at least don't propagate the wrong one anywhere else (JSON-LD `Organization.name`, etc.), and whether the legal pages need a real (lawyer-reviewed) update that's out of scope for this task.

**4. The three supporting testimonials, plus the hero quote, are live but marked unapproved in the code itself.** The comment directly above them: *"a testimonial only works because the words are really theirs. These are DRAFTS — get verbatim sign-off from Antoine, Adenaiye and Tamuno-Tekena before this ships, and never edit a quote after sign-off without re-approval."* The commit that added them (`66862c7`, PR #51) has no sign-off note. Has sign-off actually happened since? If not, this is a bigger and more urgent issue than any copy-voice problem on the page — quoting three named people without confirmed consent is live right now, independent of this audit.

**5. Em-dash ban vs. the site's actual voice.** Rule #2 bans em dashes outright. The current site uses 86 of them across every marketing page — they're not incidental, they're the load-bearing punctuation of the whole editorial voice ("Masters, artwork, contracts, split sheets — attached to the release they belong to"; "We don't sell your personal data, and we do not share your release data..."). Removing them site-wide is a full voice rewrite, not a copy edit. Confirm that's really the scope you want (every sentence restructured) versus just avoiding em dashes in *new* copy going forward.

**6. Canonical domain, OG image, analytics/Search Console** (brief §6.3–6.5, mostly self-answered by the repo, confirming rather than asking blind):
   - Production domain is already consistently `https://urganize.app` everywhere (metadataBase, JSON-LD, `robots.txt`'s sitemap reference). No www/apex ambiguity found. Flag if this is wrong.
   - An OG image exists at the correct 1200×630 size, in two places: `apps/homepage/app/opengraph-image.png` (the one Next.js actually serves via file convention) and an identical copy at `apps/homepage/public/opengraph-image.png` (unreferenced by any code I found — looks like a leftover). Confirm the public copy can be deleted, or tell me what uses it.
   - I have no access to Search Console / analytics. If you have existing query data, it should override the brief's proposed keyword list before I finalize titles/descriptions.

---

## Phase 1a — Copy audit

Legend: **Aligned** = matches brief as-is · **Drifted** = same idea, wrong words/frame · **Contradicts** = actively conflicts with brief or brand rules.

### Root layout (`app/layout.tsx`) — shared title template & JSON-LD

| Current | Verdict | Notes |
|---|---|---|
| Title template: `"Urganize"` default, `"%s \| Urganize"` | Aligned | Fine as a template; the default string only shows on pages with no own title (currently just `/pricing` — see SEO audit). |
| `LANDING_DESCRIPTION`: *"The system of record for music releases. A hand-crafted rollout plan, tasks with owners and due dates, and every release file in one workspace. Built for music managers."* | Drifted | No mention of freelance teams, WhatsApp/handoffs, or labels. Reads as single-manager tooling, not the wedge sentence. |
| `organizationSchema.name`: `"Urganize"` | Contradicts brief §4b | Brief requires the **legal name** "The Urganization, Inc." in `Organization` schema. Currently uses the product name. Also blocked by open question #3 (which legal name is actually correct). |
| `organizationSchema.sameAs`: x.com, linkedin, instagram, tiktok, youtube, threads | Aligned | Not part of copy scope; listed for completeness. |
| Only `Organization` and `WebSite`/`WebPage` schema present | Contradicts brief §4b | Brief requires `Organization` **and** `SoftwareApplication` JSON-LD. `SoftwareApplication` is missing entirely. |

**Proposed** (pending Q1–Q3): retitle the default description around the wedge sentence, e.g. *"How labels and artist managers run a release across their freelance team, without it slipping through WhatsApp and Notes."* Fix `Organization.name` once Q3 is answered. Add `SoftwareApplication` schema (category: BusinessApplication, offers referencing the three plan tiers).

### Homepage (`/`)

| Section | Current copy (quoted) | Verdict | Notes |
|---|---|---|---|
| Header eyebrow | "Music teams" | Drifted | Generic; brief's category language is "labels and artist managers." |
| Hero H1 | "Stop running releases out of *WhatsApp threads* and *Google Drive folders*." | Aligned (partially) | Correctly names WhatsApp as the enemy (brand rule #4). Missing "Notes" and the freelance-team frame from the wedge sentence — currently reads as tooling-vs-tooling, not team-coordination-vs-chaos. |
| Hero subhead | "One workspace for the whole release — a hand-crafted rollout plan, tasks your team actually owns, and every file where it belongs." | Drifted + banned pattern | Doesn't mention freelancers/handoffs. Contains an em dash (rule #2). |
| Hero CTA | "Start free for 28 days" / "NO CARD REQUIRED" | Aligned | Clear, no jargon, matches actual trial terms in `apps/web`. Keep. |
| Logo strip | "Trusted by Creative Business Academy." | Aligned | Factual claim, single partner — no overclaiming. Keep as-is (don't imply more social proof than exists). |
| Mirror section H2 | "Most teams run releases across WhatsApp, Drive, Asana, and Notion — or no system at all." | Drifted + banned pattern | Em dash. Names Notion/Asana as competitors but doesn't tie back to "freelance team" framing — reads as tool-fatigue, not coordination-across-companies. |
| Mirror "four tools" grid | WhatsApp / Google Drive / Asana / Notion / Memory | Aligned | Concrete, no jargon. Keep. |
| Mirror closing line | "Urganize replaces all of that with one structured workspace your entire team can actually use." | Aligned | Plain language, no em dash. Keep. |
| WorkspaceShot caption | "Live since January 2026" | Aligned | Factual, matches beta launch date. Keep. |
| TemplatePlan H2 | "Every release starts with a plan. Yours has 64 tasks." | Aligned | Concrete, no overclaiming, matches the real template. Strong section — keep the structure. |
| TemplatePlan body | "...hand-crafted with working managers, owned task by task by your team, and fully yours to edit." | Aligned | No jargon. Keep. |
| ThreeFeatures — "Release tasks, assigned." | "No more 'who's doing the art again?'" | Aligned | Good plain-language proof point. |
| ThreeFeatures — "Every file, filed." | "Masters, artwork, contracts, split sheets — attached to the release they belong to. No more 'Final v3 ACTUAL final' buried in Drive." | Drifted + banned pattern | Em dash. Otherwise a good concrete line — the "Final v3 ACTUAL final" bit is exactly the kind of specificity the brief wants. |
| Testimonial hero quote | "This solves an actual problem in the industry." — @zaddyfunds_, Artist Manager | See open question #4 | Sign-off status unconfirmed. Also generic — doesn't demonstrate the wedge feature or freelance-team pain specifically. |
| Supporting quotes | Antoine ("I manage myself..."), Adenaiye Miracle, Tamuno-Tekena Ayafa | Contradicts ICP (open question #2) + sign-off unconfirmed (open question #4) | Antoine explicitly self-manages a single artist — the opposite of the brief's primary ICP. |
| Final CTA H2 | "Releases shouldn't be hard to run." | Aligned | Plain, on-brand. Keep. |

### `/features`

| Current | Verdict | Notes |
|---|---|---|
| Title/meta: *"Everything a release needs. Nothing it doesn't."* | Aligned | Good honest framing, matches the "on purpose" non-features section below it (Revenue tracking / Legal contracts / Analytics dashboards / Distribution — all correctly declared out of scope, matches `CLAUDE.md` v1 scope exactly). This is the most accurate page on the site relative to actual product capability. |
| Feature blocks (Plan, Tasks, Files, Milestones, Visibility) | Aligned | All five map 1:1 to real `CLAUDE.md` v1 scope items. No overclaiming found. Genuinely good honesty discipline already in the code comments here ("Every claim on this page must describe the product as it ships today"). |
| Missing: any AI feature mention | Gap, not a violation | The rollout planner and status generator (both real, both gated behind feature flags per `CLAUDE.md`) aren't mentioned at all on this page. Worth a decision: mention them (truthfully, as "AI-tailored" not "AI chat"), or leave them off since they're still flag-gated in production. |
| Final CTA | "Run your next release with a system." | Aligned | Keep. |

### `/pricing`

| Current | Verdict | Notes |
|---|---|---|
| H1: "Built for the release. Priced per workspace." | Aligned | No jargon. |
| Subhead: "One workspace, every release your team runs." | Aligned | |
| Label tier summary: "For labels and management companies running a roster." | Aligned | This is the one place on the whole site that already speaks to the brief's stated primary ICP. Worth promoting this framing upward into the hero/homepage rather than leaving it pricing-page-only. |
| FAQ: "Who is the Label plan for?" answer | Aligned | Concrete, no overclaiming, matches `apps/web` Label tier scope in `CLAUDE.md` exactly (founder-delivered onboarding, template tailoring). |
| No `export const metadata` at all | Contradicts brief §4b | See SEO audit — this page currently falls back to the generic site-wide title/description. |

### `/press`

| Current | Verdict |
|---|---|
| "Urganize is the system of record for music releases... Built for the people actually running the campaigns." | Aligned, minor drift — "the people actually running the campaigns" is close to the ICP but doesn't say labels/managers/freelance team specifically. |

### `/team`

Names and titles only, no marketing copy — nothing to audit against brand voice. Confirmed the two founders and five team members listed match no other source I can cross-check against (no LinkedIn/roster doc in repo) — take the list as correct unless you say otherwise.

### `/privacy`, `/terms`, `/subprocessors`

Per brief §5 ("do not touch... legal pages' substantive content"), these are reported, not rewritten. Notable:
- Both `/privacy` and `/terms` are unusually well-disciplined about *not* overclaiming — e.g. Privacy §05 explicitly says AI output "is a draft for you to edit — the product works without it," which matches `CLAUDE.md`'s architectural principle almost verbatim. Whoever wrote these clearly worked from the real codebase.
- Both contain the entity-name conflict from open question #3.
- Both use em dashes extensively (18 in Privacy, 12 in Terms) — same tension as open question #5, but doubly sensitive here since it's legal text I'm not supposed to substantively edit. A voice-only pass (comma/period restructuring with zero meaning change) might be acceptable to you even under the "don't touch substantive content" rule, but I'd want that confirmed explicitly given it's legal copy.
- `/subprocessors` is a factual list, not marketing copy — no brand-voice issues, no findings beyond em-dash count.

---

## Phase 1b — SEO audit

### Titles & meta descriptions

| Page | Current `<title>` | Length | Current description | Length | Verdict |
|---|---|---|---|---|---|
| `/` | "Urganize — Your release deserves a process." | 45 | "The system of record for music releases. A hand-crafted rollout plan, tasks with owners and due dates, and every release file in one workspace. Built for music managers. Free for 28 days." | 190 | Title OK length, but has an em dash (rule #2) and doesn't contain the primary keyword phrase or wedge language. **Description is 190 chars — over the 155 cap**, needs trimming regardless of copy changes. |
| `/features` | "Features \| Urganize" (via template) | 20 | "What Urganize does: a hand-crafted release rollout plan, tasks with owners and dependencies, per-release file storage, and event milestones — in one workspace." | 162 | Title fine but generic — doesn't contain a target keyword. **Description is 162 chars — over cap**, and has an em dash. |
| `/pricing` | **"Urganize"** (falls back to root default — no page-specific title) | 8 | Falls back to `LANDING_DESCRIPTION` (same as homepage) | 190 | **Real gap.** No `metadata` export exists in `page.tsx`, and `PricingPageClient.tsx` can't have one (client component). Needs an explicit `metadata` export added to `page.tsx` (it's already a server component wrapping the client one — trivial fix). |
| `/press` | "Press Kit \| Urganize" | 21 | "Logos, product description, and contact for press inquiries about Urganize." | 78 | Fine, unique, under caps. No target keyword needed here (not a conversion page). |
| `/team` | "Team \| Urganize" | 16 | "The team behind Urganize." | 27 | Fine, unique, under caps. |
| `/privacy` | "Privacy Policy \| Urganize" | 26 | "What Urganize collects, why, who processes it, and the choices you have." | 74 | Fine. |
| `/terms` | "Terms of Service \| Urganize" | 28 | "The terms that govern your use of Urganize — accounts, subscriptions, your content, and our responsibilities." | 112 | Fine length; has an em dash (low stakes here, it's a description not a legal claim). |
| `/subprocessors` | "Subprocessors \| Urganize" | 25 | "The third-party services Urganize uses to operate, and what data each one processes." | 87 | Fine. |

All eight are at least *unique* — no duplicate-title problem. The two conversion-critical pages (`/` and `/features`) are the two with real problems: over-length descriptions and no primary-keyword presence. `/pricing` is the only outright gap.

**Proposed keyword targets** — brief lists "music release management," "artist manager software," "music project management," "label management tool," plus cover-art-approval and release-checklist long-tail. I have no Search Console/analytics access (open question #6) to validate these against real query data, so treat as a starting hypothesis: I'd place "music release management" on `/` (closest to current positioning), "artist manager software" or "label management tool" on `/pricing` given the Label tier already exists, and hold the cover-art-approval long-tail until open question #1 is resolved — no point targeting a keyword for a feature that isn't confirmed to exist.

### Heading hierarchy

Checked one `<h1>` per page — **all eight pass**. `/features` correctly nests `<h1>` → per-feature `<h2>` → (no h3 needed, flat list). Legal pages use `<h1>` → numbered `<h2>` per section via the shared `LegalSection` component — clean, semantic, no design-only headings found.

### Open Graph / Twitter cards

- Homepage (`/`) explicitly sets `openGraph` and `twitter` (summary_large_image) in `page.tsx`. Good.
- **Every other page** (`/features`, `/pricing`, `/press`, `/team`, `/privacy`, `/terms`, `/subprocessors`) has **no page-level `openGraph`/`twitter` metadata** — they inherit nothing from the root layout either, since `layout.tsx`'s `metadata` object doesn't define `openGraph`/`twitter` at all. In practice this means every non-homepage share card falls back to whatever Next.js can infer from the file-convention `opengraph-image.png`, but title/description on the card itself will be missing or wrong. This is the single biggest concrete SEO gap on the site.
- OG image itself: correct 1200×630 size, present via file convention (`app/opengraph-image.png`) — no missing-image flag needed, just missing per-page title/description wiring.

### Structured data

- `Organization` and `WebSite`/`WebPage` schema present, injected once in the root layout (so it appears on every page, including ones where a `WebPage`-typed homepage schema doesn't really apply — minor technical debt, low priority).
- `Organization.name` uses "Urganize" not the legal name (see open question #3 + copy audit).
- **`SoftwareApplication` schema is entirely absent** — required by brief, not present anywhere.
- No per-page-type schema (e.g., no `AboutPage` for `/team`, no `FAQPage` for the `/pricing` FAQ section, which is a real missed opportunity — FAQ rich results are one of the higher-ROI schema additions and the content already exists verbatim in `PricingPageClient.tsx`).

### Technical

| Item | Status |
|---|---|
| Canonical URLs | **Missing entirely.** No `alternates.canonical` set on any page, and `metadataBase` alone does not emit a `<link rel="canonical">` tag in Next's Metadata API — it only resolves relative image/URL fields. Every page needs an explicit canonical. |
| `sitemap.xml` | Exists (`app/sitemap.ts`) but **lists only the homepage.** All seven other public pages are absent from the sitemap. |
| `robots.txt` | Present, correct, points at the sitemap. One nit: the file's own header comment says "Last Updated: 2024-12-30," which predates this company's current stage by over a year — cosmetic but worth a refresh if you're touching the file anyway. |
| Favicon set | Complete — `favicon.ico`, `apple-icon.png`, `icon0.svg`, `icon1.png`, plus `manifest.json` referencing 192×192/512×512 PWA icons. No gaps. |
| `manifest.json` theme | `theme_color`/`background_color` both `#ffffff` (white), but the site is forced dark (`data-marketing-theme="dark"` on `<html>`). Minor inconsistency — a backgrounded PWA install/splash screen would flash white against a dark brand. |
| 404 page | **No custom `not-found.tsx`** — falls back to Next.js's bare default 404. Low priority but a missed brand-consistency and internal-linking opportunity. |
| www vs apex / trailing slashes | No redirect config found in `vercel.json` for this; `SITE_URL` is consistently `https://urganize.app` (apex, no www) everywhere I checked. No conflict found — looks already resolved by convention rather than explicit redirect rules. Flag only if you know of a `www.urganize.app` presence I didn't find. |
| `lang` attribute | Set correctly: `<html lang="en">`. |
| Image `alt` text | Spot-checked every `<Image>` in `Sections.tsx` and the header/footer — all have descriptive, non-empty `alt` text (the workspace screenshots even describe *what's in* the screenshot, e.g. "four releases in flight, each with artist, release date, and task progress toward its 64-task plan" — genuinely good practice, better than most marketing sites). No missing alt text found on the pages in scope. |
| Metadata API usage | Confirmed — every page uses Next's `export const metadata` convention, no hand-rolled `<head>` tags found except the deliberate JSON-LD `<script>` blocks in the root layout (which is the correct pattern for structured data). |
| Client components blocking static rendering | `/pricing` is dynamic by design (reads `x-vercel-ip-country` via `headers()` for currency geo-resolution — documented in-code, intentional trade-off, not a bug). All other marketing pages are plain server components with no unnecessary `"use client"` at the page level — only leaf interactive pieces (`ScrollReveal`, the currency toggle) are client components. This is already close to ideal; no changes needed here. |

---

## Phase 1c — Quick quality pass

### Performance basics

- **YouTube iframe embedded directly in the hero fold** (`HeroSection`, `Sections.tsx`): the `<iframe src="youtube.com/embed/...">` loads immediately on page load, not lazily, and it's the heaviest third-party resource on the page competing with LCP right in the hero. A facade/click-to-play pattern (static thumbnail + play button that swaps in the real iframe on click) would meaningfully help LCP without losing the video. Flagging, not fixing — this is a real code change, not "trivial."
- Fonts: `next/font/google` used for all four typefaces (Cormorant Garamond, Instrument Sans, IBM Plex Mono, Roboto Mono) — self-hosted, no external font-loading CLS risk. Good.
- Images: `next/image` used throughout with explicit `width`/`height` (no CLS from image loading) and responsive `sizes` attributes on the two large product screenshots. Good.
- Two Google Tag Manager/Analytics `<script>` tags plus Vercel Analytics plus a `Suspense`-wrapped Formbricks provider all load on every marketing page — reasonable given the analytics stack described in `CLAUDE.md`, not flagging as excessive, but worth knowing it's four separate third-party scripts stacked on top of the YouTube embed.

### Accessibility

- Focus states: not verified without a running browser — recommend a manual tab-through pass during Phase 2 verification rather than static-code judgment here.
- Contrast: CTAs use `--marketing-primary`/`--marketing-primary-text` tokens consistently; can't confirm actual contrast ratios from source alone — recommend a Lighthouse/axe run during Phase 2 verification.
- Alt text: covered above — no gaps found in scope.
- Button vs. link semantics: spot-checked — CTAs to `/auth` and external URLs correctly use `<Link>`/`<a>` (navigation), and the pricing currency toggle correctly uses `<button role="radio">` inside `role="radiogroup"` (a real control, not navigation). No mis-semantic elements found.

No changes made in this pass — nothing surfaced was trivial enough to fix without risking scope creep into the layout/design work the brief explicitly excludes (§5: "Do not redesign layout or change visual design").

---

## What I'd do next

Once you've answered the six open-question groups above (especially #1, since it determines whether the entire wedge-feature narrative can be written at all), I'll turn this into the three-commit Phase 2 sequence from the brief: (1) metadata/titles, (2) structured data + technical SEO, (3) copy per section — each reviewable independently, each verified with a build.
