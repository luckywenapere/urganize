/**
 * The order of the release menu on a phone — the folded "more" list behind the
 * hamburger at the base of TasksPanel.
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
  // Conditional and self-removing (only while the release has no activities or
  // a draft is waiting), so it costs the list nothing to put it first: "A
  // release with no activities has exactly one job, and this is it."
  'plan',
  // The activity list seen a different way, so it reads as a view switch
  // rather than another surface — his stated reason for placing it "closest to
  // Activities", and it leads both existing rows.
  'timeline',
  // Marketing is 37 of the playbook's 64 activities, the largest block by a
  // wide margin, and the content calendar is where that work gets planned.
  // Promoted to a permanent tab 2026-08-16.
  'calendar',
  // Marketing again, and named outright: "pitching is frequent enough to earn
  // a permanent, always-visible spot rather than the folded menu."
  'pitch',
  // Distribution, 11 of 64 — nine release-level fields plus a collect link and
  // the submissions that come back, so it is returned to across the whole
  // rollout rather than filled in once. Also a promoted tab.
  'metadata',
  // Asset production, 9 of 64 between them: a handful of touches each, early,
  // and then done. Kept adjacent because they are the release's core identity
  // assets and get set in the same sitting.
  'coverart',
  'song',
  // The general file cabinet — everything that is not the cover or the master.
  'files',
  // The first of the non-scene actions: a paragraph you generate and send,
  // repeated through the rollout rather than once at the end.
  'status-update',
  // Outward-facing, and demoted from a permanent tab in his own words: press
  // kit "isn't reached often enough to earn a permanent tab". Fan capture sits
  // with it as the other "send this outward" item — his pairing, kept from the
  // desktop footer row.
  'epk',
  'capture',
  // Once, after release day.
  'recap',
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
