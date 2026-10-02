/**
 * The order of the rollout menu, on both surfaces that show it: the folded
 * "more" list behind the hamburger at the base of TasksPanel on a phone, and,
 * since 2026-09-30, the vertical card at the top of the right-hand column on a
 * desktop (RolloutMenu.tsx). lib/rollout-menu.ts builds both from this one
 * order, so they cannot rank the same rows two ways.
 *
 * (Everything below was written about the phone's list and says so; the
 * reasoning is unchanged by the desktop sharing it. The desktop's own row of
 * pills used a different order, which is why sharing this one MOVED Chat,
 * Content and Pitch up and Metadata, Cover art, Song and Files down there.)
 *
 * Why this is a module rather than the incidental order of an array literal:
 * on 2026-08-31 the founder removed the mobile top-tabs strip and asked for
 * everything to move into that menu "in an order that makes sense to the user
 * based on previous usage data". The order is therefore the deliverable, so it
 * lives somewhere a test can pin it, and `ReleaseMenuKey` makes TypeScript
 * refuse a new menu entry that has not been given a position — the mechanism
 * that stops the next scene being appended to the bottom by default.
 *
 * ── ON "USAGE DATA", SAID PLAINLY ──────────────────────────────────────────
 * There is none, and pretending otherwise would be the worst outcome here.
 * `captureAnalyticsEvent` sends to PostHog and otherwise appends to the
 * VIEWER'S OWN localStorage, and `NEXT_PUBLIC_POSTHOG_KEY` is not set in
 * production (recorded in CLAUDE.md, 2026-08-24) — so no click has ever been
 * counted, and the events that do exist are unreadable by anyone but the
 * person who generated them. Nothing server-side records a scene open either.
 *
 * So this order rests on the two proxies that ARE real and checkable:
 *
 *   1. The founder's own placement decisions, over five rounds of correction
 *      between 2026-08-16 and 2026-08-31 — which items he promoted to a
 *      permanent tab, which he demoted, and the reasons he gave at the time.
 *      That is revealed preference rather than click data, but it is his.
 *   2. How often a rollout returns to each surface, taken from the hand-crafted
 *      playbooks, which are this product's own model of a release. Tag counts
 *      across single_v0.3's 64 activities: marketing 37, followup 19,
 *      planning 16, distribution 11, editorial 9, asset_production 9,
 *      analytics 7, event 5, release_day 3.
 *
 * The gradient that falls out of those two: places you work in repeatedly →
 * assets you set once, early → things you send outward → things you do at the
 * end or to fix a mistake. Per-entry evidence is on each line below.
 *
 * If PostHog is ever switched on, this list is what real numbers should be
 * checked against — and the honest thing then is to reorder it from the data
 * and delete this paragraph.
 */

/**
 * Ordered, most-returned-to first. Each entry names the evidence for its
 * position; quoted reasons are the founder's, recorded in CLAUDE.md or in
 * TasksPanel's own comments at the time he gave them.
 */
export const RELEASE_MENU_ORDER = [
  // (Until 2026-09-15 a 'plan' entry led this list, conditional and
  // self-removing while a release had no activities. The review scene it
  // opened is gone: the plan is built straight into activities from the
  // planning questions, and the questions' only door is the card that fills
  // the empty panel, which needs no menu row.)
  //
  // The OTHER main view, whichever one is not currently showing. Until
  // 2026-09-06 this slot was 'timeline' — the same activities seen a different
  // way, "closest to Activities", leading both rows. It swapped when the
  // timeline became what a release LANDS on: a row pointing at the view you
  // are already looking at is noise, and the buckets are what now needs a
  // door. Same rank, same reasoning, opposite direction — and it is gated on
  // the timeline flag either way, because with that flag off the timeline is
  // unavailable AND the buckets are already the default, so neither belongs.
  'activities',
  // The rollout's own chat thread (Release & Task Chat, Phase 1). Ranked
  // second, ahead of the other promoted tabs, because it is the raw
  // coordination surface the PRD built this feature to replace WhatsApp
  // with — closer in kind to the activity list itself than to a planning
  // surface you visit for a specific task. No usage data exists for this
  // one either (see the note above); it is a reasoned placement, not a
  // measured one, and is the first thing worth reordering once real numbers
  // exist.
  'chat',
  // Marketing is 37 of the playbook's 64 activities, the largest block by a
  // wide margin, and the content calendar is where that work gets planned.
  // Promoted to a permanent tab 2026-08-16.
  'calendar',
  // Marketing again, and named outright: "pitching is frequent enough to earn
  // a permanent, always-visible spot rather than the folded menu."
  'pitch',
  // The release pitch kit (2026-10-01): the story and credits a rollout adds
  // to the artist's standing press kit. Sits beside Pitch because it is what a
  // pitch carries, and ahead of Metadata because writing the pitch is the work
  // that precedes collecting the paperwork.
  'pitchkit',
  // Distribution, 11 of 64 — nine release-level fields plus a collect link and
  // the submissions that come back, so it is returned to across the whole
  // rollout rather than filled in once. Also a promoted tab.
  'metadata',
  // Distribution (2026-10-03). Directly after Metadata because it is where
  // that paperwork pays off: the Distribute step reads the genre, language and
  // explicit flag from it and sends the team there to fix what is missing.
  // Ranked below the promoted work surfaces and above the assets set once,
  // since a rollout reaches it late (the playbook's distribution steps sit in
  // the last weeks) and then returns to it only to check delivery.
  'distribute',
  // Capture, and the only entry here that LEAVES the panel rather than
  // swapping its body — it opens the notebook with this release already
  // filtered (and, on a phone, a blank note waiting). It exists because the
  // phone is the one place the loop is broken: on a laptop the menu's Notes
  // row carries `?release=` and "New note" pre-links from that filter, so it
  // is two clicks, while MobileNavBar's Notes tab carries no release at all
  // and leaves you hunting for it in a picker. This row closes that gap.
  //
  // Placed here rather than higher because a note is taken repeatedly across
  // a rollout — during a call, mid-DM — so it belongs in the band you return
  // to rather than with the assets you set once. But below the four promoted
  // tabs, because the founder declined to promote notes (2026-08-15, kept off
  // the mobile pills) and that is the only revealed preference there is. Note
  // that call was about the PILL ROW, two weeks before the 2026-08-31 rework
  // made this menu the phone's home for per-release actions — so it is not
  // read as barring the menu, only as ranking it below what he did promote.
  'note',
  // Asset production, 9 of 64 between them: a handful of touches each, early,
  // and then done. Kept adjacent because they are the release's core identity
  // assets and get set in the same sitting.
  'coverart',
  'song',
  // The general file cabinet — everything that is not the cover or the master.
  'files',
  // Share to socials (2026-09-23). Outward-facing, so it leads the "send this
  // outward" band below, and ahead of fan capture because every rollout gets
  // announced while only some get a capture page. The founder made it the
  // first thing offered after a first rollout, which is the one revealed
  // preference about it there is.
  'share',
  // Outward-facing, and demoted from a permanent tab in his own words: press
  // kit "isn't reached often enough to earn a permanent tab". Fan capture sits
  // with it as the other "send this outward" item — his pairing, kept from the
  // desktop footer row.
  'capture',
  // A correction, not a place to work.
  'change-artist',
  // Terminal.
  'archive',
] as const;

/**
 * Every key the menu can hold. A new entry in TasksPanel must be added to
 * RELEASE_MENU_ORDER above or it will not type-check — which is the point:
 * ordering is a decision, and the compiler is a better place to force it than
 * a review comment.
 */
export type ReleaseMenuKey = (typeof RELEASE_MENU_ORDER)[number];

const POSITION_BY_KEY: Record<string, number> = RELEASE_MENU_ORDER.reduce<
  Record<string, number>
>((positions, key, index) => {
  positions[key] = index;
  return positions;
}, {});

/**
 * Sort menu entries into the canonical order.
 *
 * The caller builds its entries in whatever order reads best in the component
 * (today: the same order as this list, so the two agree on sight) and this is
 * what actually decides. Anything not in the list sorts to the end rather than
 * to the front — the type makes that unreachable from TypeScript, so it only
 * matters if a key arrives from somewhere untyped, and the tail is the safe
 * place for an entry nobody has ranked.
 *
 * Non-mutating, so a caller's array is never reordered underneath it.
 */
export function orderReleaseMenu<T extends { key: string }>(entries: T[]): T[] {
  return [...entries].sort(
    (first, second) =>
      (POSITION_BY_KEY[first.key] ?? RELEASE_MENU_ORDER.length) -
      (POSITION_BY_KEY[second.key] ?? RELEASE_MENU_ORDER.length)
  );
}
