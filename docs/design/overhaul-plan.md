# Urganize design overhaul, pass 1: Deel's structure, Urganize's skin

## HANDOFF: how to resume in a new session (read this first)
This work will span several context windows. Durable state lives in three places, created as the FIRST actions after plan approval:
1. **This plan, copied into the repo** as `docs/design/overhaul-plan.md` (worktree `urganize-design-overhaul-7a2100`, branch `claude/urganize-design-overhaul-7a2100`). It is the source of truth; update its checklist after every pass.
2. **A progress checklist** at the bottom of that file (the "Progress log" section below). Tick items and note commit SHAs and what is unverified.
3. **A memory entry** `urganize-design-overhaul.md` (type project) in the project memory folder, with a one-line pointer in `MEMORY.md`: "Design overhaul: read docs/design/overhaul-plan.md, branch claude/urganize-design-overhaul-7a2100". Also add a short dated section to CLAUDE.md when pass 1 lands.
To resume: open the worktree, read `docs/design/overhaul-plan.md`, read the Progress log, run `git log --oneline -15`, then continue at the first unticked item. Do not re-ask the founder the settled questions below.

### Skills to invoke (the founder installed these; use them, do not skip)
- **shadcn**: for every component built (add/compose primitives, tokens via components.json conventions, composing tables, tabs, dropdowns, command bar, sheets, chat drawer). Check whether `apps/web` or `packages/ui` has a `components.json`; if not, use shadcn's patterns/registry docs as reference and adapt to our Tailwind v3 preset rather than running `init` blindly.
- **Jakub's pack, the `better-*` skills**: `better-interface` (full review at the end of each pass), `better-ui` (radius, optical alignment, hit areas, depth), `better-layout` (grouping, reading order, progressive disclosure), `better-typography` (scale, wrapping, truncation, tabular numbers in tables), `better-colors` (semantic tokens, contrast), `better-accessibility`, `better-writing` (copy).
- **design:design-system**, **design:design-critique**, **design:accessibility-review**, **design:ux-copy** for audits and copy.
- **design-consultation / design-html / design-shotgun / design-review** (gstack) for variant exploration and live visual QA.
- Use **qa / run** skills for browser verification at 1440/1024/375, dark and paper.
Order per screen: better-layout (structure) -> shadcn (build) -> better-ui + better-typography (polish) -> better-accessibility -> design-review in the browser.

### Progress log (tick as you go)
- [x] 0. Copy plan into repo, save memory pointer (2026-10-04)
- [x] 1. (Reviewed 2026-10-04 on the Catalogue at desktop: rows, header and chips already read at Deel density, so no token change was made. Revisit only if the founder asks.) Tokens + type/density pass (globals.css, tailwind preset) (no flag)
- [x] 2. Nav model (`lib/` pure builder + tests), no flag
- [x] 3. Shell components: TopNav, SubNav, PageHeader, ArtistSwitcher, CreditsChip, BottomBar + More sheet
- [x] 4. FloatingUrgAns drawer + Home ask-bar + ⌘K command bar
- [x] 5. ComingSoon screen (page on phone, inline panel on desktop), interest capture
- [x] 6. Home: ask bar, For you today cards, onboarding bar, top-bar artist filter Home (needs-attention list, per-artist progress, onboarding bar, empty states)
- [x] 7. Catalogue > Releases table + chips + card toggle (+ mobile cards)
- [x] 8. Artists table, rollout header + tabs, old shell removed; Relationships and Shows use PageHeader Artists table, rollout workspace header/tab strip, remove RightRail menu in new shell
- [ ] 9. Skeleton sync, tours/help-copy/guards, tests, CLAUDE.md section
- [ ] 10. Verify (tests, lint, tsc, build both flag states, browser at 3 widths x 2 themes) and founder preview pass
- Later passes (not started): Relationships, Shows, Settings, press kit/public pages, onboarding, billing wall, native shell

## Context
Urganize is repositioning (strategy doc 2026-10-01) as the team app for everything after the music is made, sold to **managers running more than one artist**. It has seven areas: Home, Catalogue, Relationships, Opportunities, UrgAns, Audience, Shows. Today's UI is a left side menu plus a card catalog, no page titles, no filter bars, and a flag-gated Home that already exists. The founder wants Deel's shell, density and hierarchy applied holistically, with unbuilt areas shown as "coming soon".

Settled by the conflict doc (Oct 3): subscriptions stay, pay-as-you-go and a per-release pass sit beside them, the word is **Credits** everywhere, crypto is on hold. None of that changes the shell. It only shapes the credits chip and copy.

## Founder decisions (from the questions)
- Manager opens the app to see **what's on fire**. Home is action-first.
- **Top bar with pills + a sub-tab row. The left menu goes.**
- **Artist first, then release.** A group-style artist switcher sits in the top bar.
- Visual: **Deel's structure, Urganize's skin.** Keep ink, cream, spring green, Fraunces and the textile character. Dark default with paper mode.
- **Mostly phone**, so phone-first: bottom bar with Home, Catalogue, UrgAns, Shows and More, and tables collapse to cards.
- Catalogue = **dense table with filter chips**, with a card-view toggle.
- Unbuilt areas: **not greyed.** They are normal pills. Clicking one shows a "Coming soon" screen in the place the next page would go: a full page on phone (a popup is hard to dismiss and loses context) and an inline panel on desktop. A "tell me when it's ready" button writes to the existing analytics/waitlist so interest is measured.
- UrgAns: a **"Search or ask UrgAns" bar on Home, a floating button on every page that opens a side drawer, and a ⌘K command bar**.
- Money: a **quiet credits chip** in the top bar. The trial/plan strip shows only when it matters. Estimates appear before AI runs.
- Friction to design against, all four: not knowing what to do next, the team not being in it, AI/credit anxiety, setup before value / WhatsApp being faster.
- Scope: **Foundation + Home + Catalogue**, later passes for the rest, everything behind a flag.

## Information architecture
Top pills, in order: **Home | Catalogue | Relationships | Opportunities | UrgAns? | Audience | Shows | More**
- UrgAns is not a pill; it is the floating button + drawer + Home bar + ⌘K (per the doc, "an entry point on every screen"). The existing full page `/dashboard/urgans` stays reachable from the drawer's expand control and from More.
- Sub-tab row under the pills (Deel's second row):
  - Catalogue: Artists | Releases | Files (Files tab shows "coming soon" while the files flag is off) | Press kits
  - Relationships: People | Directory | Pitching (Pitching is the team's sent pitches)
  - Shows: Shows | Setlists | Songs
  - Opportunities, Audience: single "Coming soon" screen, no sub-tabs
  - Home: none
- Top bar, left to right: logo, **workspace + artist switcher** ("All artists" by default), pills, ⌘K search, credits chip, settings, help, bell, avatar. Settings stays outside the seven (avatar menu + gear).
- Mobile: top bar keeps switcher, search, bell. Bottom bar Home, Catalogue, UrgAns, Shows, More; More is a sheet with Relationships, Opportunities, Audience, Notes, Settings.
- Every page gets a **page title (Fraunces) and one primary action button on the right**, like Deel's "Add people". The topbar `routeTitles` array is empty today; that is where titles come from.

## Screens in pass 1
1. **Shell** (new `components/shell/*`): `TopNav`, `SubNav`, `PageHeader` (title + primary action), `ArtistSwitcher`, `CreditsChip`, `FloatingUrgAns`, `ComingSoon` (full page on phone, inline panel on desktop), `BottomBar`.
2. **Home** (extend `components/home/*` and `app/dashboard/home`):
   - Greeting + "Search or ask UrgAns" bar + All / Artists / Team filter pills
   - Left: "Needs your attention" cards (late tasks, approvals, pitch replies, shows needing a DJ pack) with count badges and Review buttons (Deel's "For you today")
   - Right: rollout progress per artist, next show, waiting-on-others (nudge button), onboarding checklist bar (Deel's "Complete your onboarding" at 56%)
   - Empty/first-run state: test-rollout and invite-teammate prompts, so there is value before setup
3. **Catalogue > Releases**: page title "Releases", **Add rollout** button, filter chip bar (Artist, Status, Format, Date, Owner), "Total N rollouts", table columns Release (cover + title + artist) / Status pill / Release date / Progress (done of total) / Next task / Owner / row menu. Clickable rows open the rollout workspace. On phone the rows become cards. Card-view toggle for cover-art lovers.
4. **Catalogue > Artists**: reuse `/dashboard/artists`, restyled into the same table pattern.
5. **Rollout workspace header**: breadcrumb (Catalogue / Artist / Rollout), title + status pill, the existing rollout menu rows moved into a horizontal tab strip (Timeline, Tasks, Metadata, Distribute, Pitching, Files...) replacing `RightRail`'s rollout menu card; UrgAns becomes the floating drawer.
6. **Tokens**: radii, spacing and type scale tuned to Deel's density (13/14px table text, 56px rows, soft tinted header band using brand-subtle instead of Deel's lavender). All in `apps/web/app/globals.css` and `packages/config/tailwind/preset.js`; semantic tokens mean most pages inherit.
7. **Copy sweep for the shell only**: "Catalogue" (not Catalog) to match the strategy doc, "rollout" as the object, plain fifth-grade labels. Coming-soon copy per area: what it will do + "Tell me when it's ready".

## Implementation approach
- **NO FLAG (founder decision 2026-10-04): everything goes live straight.** The new shell replaces the old one outright; delete the superseded left menu/right rail code paths rather than keeping them. Existing per-feature flags (notes, events, pitching...) still decide which destinations exist.
- `AppShell.tsx` (795 lines) renders `TopNav/SubNav/BottomBar/FloatingUrgAns` and no longer mounts `WorkspaceIdentityPanel` or `RightRail`.
- Reuse, don't rebuild: `lib/app-pages.ts` (page + flag logic, extend with sub-tabs), `components/app/AppTopbar.tsx` pieces (`NotificationsBell`, `HelpMenu`, `WorkspaceMenu`), `lib/layout-columns.ts`, the home components (`BriefCard`, `ArtistFilterChips`), `useChappiStore` + `ChappiSidePanel` content for the drawer, `useArtistRosterStore` for the switcher, credits snapshot from `lib/credits/*` for the chip, `lib/release-search.ts` for table search.
- Update in the same PR (per repo rules): the matching skeletons (`WorkspaceSkeleton`, page skeletons), `lib/tours.ts` anchors, `lib/help-copy.ts`, guards that list files (`rollout-vocabulary.test.ts`, `positioning-guard`), and `lib/prefetch-routes.ts`.
- New tests in `lib/` (pure logic only, the repo has no component tests): nav model builder (pillar order, flags, sub-tabs, coming-soon), attention-list ranking for Home, table filter/sort, credits-chip state.
- Keep the repo's non-negotiables: accessibility guards (contrast, 44px targets, focus), no em dashes, never "workspace" in copy, schema untouched (no migration).
- CLAUDE.md gets a dated section recording the decision, the flag and what is unverified.

## Out of scope for pass 1 (later passes, each flagged)
Relationships/Shows/Directory/Notes/Settings page restyles, press kit and public pages, onboarding wizard, billing wall, native Expo shell chrome, Opportunities/Audience real builds.

## Verification
- `pnpm test` (vitest), `eslint .` against the 3-error baseline, `tsc --noEmit`, `next build` by exit code in both flag states, with `/auth`, `/settings`, `/dashboard` still static.
- Run the dev server and look at Home, Catalogue and a rollout at 1440, 1024 and 375px, in dark and paper mode, using the Browser pane. Compare against the two Deel screenshots.
- Honest limit: an authenticated session cannot be minted in this sandbox, so real-data states need the founder's pass on a preview deploy.

### Log, 2026-10-04 (later)
- Sub-tab row is now a full-bleed continuation of the top band with one hairline (52e8fc5f).
- Onboarding wizard: rounded card, option rows, fields; pill buttons (e81afd05). Billing wall already used the shared pill Button and rounded cards, so no change.
- Phone bottom bar floats as a glass pill and collapses to a round active-tab button on scroll down, opens on scroll up or tap (1b3674af). Reference: the founder's WhatsApp clip. Unverified on a real phone.
- Still open: Settings and public pages in the new style, tours verified by clicking through, paper-mode check of the new bar and band.
- Paper mode checked for the band, sub-tab row and floating bar: reads cleanly. Settings pop-up already matches the shell, no change. Tour anchors all exist on the new shell (read in code; not clicked through) and the copy still holds.

### Log, 2026-10-04 (Home engineered, detail pages)
- Person and show detail pages: person page uses PageHeader with "We spoke today" as the one primary pill; show page title is larger and Edit is the filled pill.
- Home reading order, designed from where the eye goes: greeting (largest type) -> summary strip (late / due today / waiting on others, each a jump link) -> "For you today" cards (capped at 3) -> ask bar -> getting started (hides itself) -> two columns. Left: Your tasks (5 shown) then Waiting on others (3 shown), each with "Show N more". Right: Next show, Rollouts, Placements.
- Why: Waiting on others used to sit under an unbounded task list, so on a phone it was screens down. The strip gives it a front door at the top, and the caps keep it within one scroll.
- Skeleton synced (strip, cards, ask bar). Not seen with real data: local Supabase is unreachable, so Home only renders its skeleton here. Needs a look on the preview, at 375 and 1440.
- Home consolidation (founder, from a screenshot): the strip and the "For you today" cards both said "111 tasks late" and "4 waiting". The eye went to the strip first, so the strip owns task counts; the cards now cover only what a count cannot say (set runs over, DJ not opened the tracks, playlist added a song) and the section disappears when there are none.
- "Do this first" card under the strip: one task (late, else due today, else this week; highest priority, then oldest), with a checkbox and an Open button. It is removed from the list below so nothing repeats. Rule in lib/home/focus.ts, tested.
- Empty day: when there is no task to do first, the same slot shows "Up next" (lib/home/up-next.ts): the coming show, else the soonest rollout, else "Plan your next rollout". Home never ends on nothing.
- Public pages (press kit, credits, fan capture), seen on the live share links: already dark-locked and on brand; the gap was shape. Credits and capture inputs, cards, cover art and buttons are rounded and pill-shaped now; press kit photos and notice nudged to rounded-xl. Colours, mono labels and the textile ground untouched. Not seen after the change: these pages need a real token, which local dev has no database for. Check the preview with the same three links.

### Log, 2026-10-04 (wall, tours, Home phone pass; founder answers)
- Home at 375px (from a screenshot): lists fold to 3 tasks / 2 waiting / 2 releases / 2 placements, empty Next show and Placements are one line instead of dashed boxes, ask-bar label shortened so it does not truncate.
- Billing wall (founder: one big Pay action, show real numbers): one centred column; the Pay button is the single filled action (min-h-14); "Talk to us" became a quiet text row under it (WhatsApp, email), tracking unchanged; the headline now says what is theirs ("Your 12 rollouts, 111 activities and 4 teammates are exactly where you left them.") from GET /api/billing/wall-summary (open route, counts only, rule in lib/wall-summary.ts, falls back to the old line); a trust line under the button. Copy rules kept: no guilt, no countdown. Superseded: the "equal weight" rule in the old TeamWall header comment.
- Tours: the first-visit catalogue tour now starts on Home (where people land), last step points at the Catalogue pill (lib/tours.ts HOME_TOUR_FINISH). Replay from Help and Settings still works. Tour anchors verified present in the new shell.
- Settings: already the modal with a left list and search; sections are short. Only "Artists & brand" is long (five blocks) and could be grouped. Not changed.
- Not seen: the wall (needs a walled account) and the tour (flag off, needs data). Check on the preview with a trial-ended account and with NEXT_PUBLIC_FEATURE_TOURS on.
