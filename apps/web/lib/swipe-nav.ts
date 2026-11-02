// The swipe navigation (URG-380, Oyin approved the mocks Oct 18, 2026).
//
// Three top tabs you swipe between, Home · Assistant · Sessions (Team moved
// into the avatar's account page Nov 1, 2026 and Sessions took its place, one
// per rollout, founder call), and one avatar menu for everything else. The bottom bar and the More sheet go away while it
// is on. On for everyone since v1.160.5; a person can opt out (see
// useSwipeNavStore).
//
// PURE. Everything here is maths and data the components read, so the rules
// that decide a gesture (direction lock, settle, rubber band) and the spring are
// unit tested without a DOM. The numbers are the approved motion spec in
// /workspace/work/nav-swipe-mocks/notes.md, copied, never re-tuned by eye.

import { URGANS_HREF, ARTISTS_HREF, TEAM_HREF, CATALOGUE_LABEL } from './shell-nav';
import { artistIdFromPath } from './artist-page';

export type SwipeTabKey = 'artists' | 'urgans' | 'sessions';

/** The Sessions tab: one session per rollout (Nov 2, 2026). */
export const SESSIONS_HREF = '/dashboard/sessions';

export type SwipeTab = { key: SwipeTabKey; label: string; href: string };

export const SWIPE_TABS: readonly SwipeTab[] = [
  // The same word as the classic menu (Home since Oct 30, 2026, #886, #892).
  { key: 'artists', label: CATALOGUE_LABEL, href: ARTISTS_HREF },
  { key: 'urgans', label: 'Assistant', href: URGANS_HREF },
  { key: 'sessions', label: 'Sessions', href: SESSIONS_HREF },
];

/** The user_metadata key a person's own choice is kept in (false = classic). */
export const SWIPE_NAV_METADATA_KEY = 'swipe_nav';

/** ?nav=swipe turns it on for the signed-in person, ?nav=classic turns it off. */
export const SWIPE_NAV_QUERY_KEY = 'nav';

/**
 * On for everyone by default (Oyin, Oct 19, 2026). A person whose account
 * carries swipe_nav: false (what ?nav=classic writes) keeps the classic nav.
 * The build flag NEXT_PUBLIC_FEATURE_SWIPE_NAV='false' is the kill switch: off
 * for everyone, whatever the account says.
 */
export function resolveSwipeNav(input: { allOff?: boolean; metadata: Record<string, unknown> | null | undefined }): boolean {
  if (input.allOff) return false;
  const value = input.metadata?.[SWIPE_NAV_METADATA_KEY];
  return !(value === false || value === 'false');
}

/**
 * Phone-width screens only: below Tailwind's lg breakpoint (1024px). Desktop
 * and anything lg and up keeps the classic sidebar shell whatever the account
 * says (v1.160.5 turned swipe on for everyone without this, and desktops lost
 * their sidebar).
 */
export const SWIPE_NAV_MAX_WIDTH_PX = 1023;
export const SWIPE_NAV_MEDIA_QUERY = `(max-width: ${SWIPE_NAV_MAX_WIDTH_PX}px)`;

/**
 * Whether this screen draws the swipe shell. Needs the account's answer to be
 * on AND a phone-width viewport. An unknown viewport (server render, hydration,
 * no matchMedia) is classic, so a desktop never flashes the swipe shell.
 */
export function shouldShowSwipeNav(input: { enabled: boolean | null; phoneWidth: boolean | null }): boolean {
  return input.enabled === true && input.phoneWidth === true;
}

/** What a ?nav= value asks for: true (on), false (off), or null (nothing). */
export function readSwipeNavQuery(value: string | null | undefined): boolean | null {
  if (value === 'swipe') return true;
  if (value === 'classic') return false;
  return null;
}

/** The query string of the page, or anything with a `get` (URLSearchParams,
 *  Next's ReadonlyURLSearchParams). */
type SearchLike = string | { get: (name: string) => string | null } | null | undefined;

/** True when the address opens a rollout: /dashboard?release=<id>. Since
 *  Oct 30, 2026 /dashboard alone is the artist list, so the path cannot tell
 *  the two apart; the query does. */
export function opensRollout(search: SearchLike): boolean {
  if (!search) return false;
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return Boolean(params.get('release'));
}

/** Which tab a path is, or null for a pushed screen (a rollout, settings…).
 *  Pass the query too: /dashboard is the Artists tab, but /dashboard?release=
 *  is a rollout pushed over it. */
export function swipeTabForPath(pathname: string | null | undefined, search?: SearchLike): SwipeTabKey | null {
  if (!pathname) return null;
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === ARTISTS_HREF) return opensRollout(search) ? null : 'artists';
  // The old address still shows the list (for Android apps built before the move).
  if (path === '/dashboard/artists') return 'artists';
  if (path === URGANS_HREF) return 'urgans';
  if (path === SESSIONS_HREF) return 'sessions';
  return null;
}

/**
 * The tab a pushed screen belongs to, so its top bar lights the right word.
 * Artists covers the catalogue (rollouts, an artist's page); everything else
 * (settings, relationships, opportunities) lights nothing.
 */
export function swipeAreaForPath(pathname: string | null | undefined, search?: SearchLike): SwipeTabKey | null {
  const tab = swipeTabForPath(pathname, search);
  if (tab) return tab;
  if (!pathname) return null;
  if (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/releases') ||
    pathname.startsWith('/dashboard/artists') ||
    artistIdFromPath(pathname) !== null ||
    pathname.startsWith('/dashboard/distribute')
  ) {
    return 'artists';
  }
  if (pathname.startsWith('/dashboard/urgans')) return 'urgans';
  return null;
}

/**
 * Pushed pages that open from the avatar menu with no way back of their own
 * (the Directory first). The swipe top bar draws a back arrow on exactly these,
 * so a page opts in by being listed here. Other pushed pages (a rollout, an
 * artist, a person, credits, notes) already carry their own back control.
 */
export const SWIPE_BACK_PATHS: readonly string[] = [
  '/dashboard/directory',
  '/dashboard/relationships',
  '/dashboard/opportunities',
  '/dashboard/press-kits',
  // Team left the tabs for the account page (Nov 1, 2026), so it is a pushed page.
  TEAM_HREF,
];

/** Where the back arrow goes when there is no earlier in-app page, or null for no arrow. */
export function swipeBackFor(pathname: string | null | undefined): { href: string } | null {
  if (!pathname) return null;
  const path = pathname.replace(/\/+$/, '') || '/';
  return SWIPE_BACK_PATHS.includes(path) ? { href: ARTISTS_HREF } : null;
}

/** An earlier in-app page is a fine place to go back to only when it is inside the app. */
export function swipeBackTarget(previous: string | null, current: string, fallback: string): string {
  if (previous && previous.startsWith('/dashboard') && previous.split('?')[0] !== current) return previous;
  return fallback;
}

/**
 * What the top bar's Back arrow does. With an earlier in-app page this tab came
 * from, it goes BACK in history (so the browser's own Back is never one step
 * behind it and the two cannot ping-pong: a push would leave the page it just
 * left as the next Back). With none (a deep link, a fresh tab) it REPLACES the
 * page with the fallback, so Back from the fallback leaves rather than returning.
 */
export function swipeBackAction(
  previous: string | null,
  current: string,
  fallback: string,
  historyLength: number
): { kind: 'history' } | { kind: 'replace'; href: string } {
  const hasEarlierPage = previous !== null && swipeBackTarget(previous, current, '') !== '';
  if (hasEarlierPage && historyLength > 1) return { kind: 'history' };
  return { kind: 'replace', href: fallback };
}

/** The browser tab title for a swipe tab, in the same shape the pages' own metadata gives. */
export function swipeDocumentTitle(key: SwipeTabKey): string {
  // The Artists page keeps its own name in the browser tab; the menu word is Home.
  if (key === 'artists') return 'Artists | Urganize';
  const tab = SWIPE_TABS.find((entry) => entry.key === key);
  return `${tab ? tab.label : 'Artists'} | Urganize`;
}

export function swipeTabIndex(key: SwipeTabKey): number {
  return SWIPE_TABS.findIndex((tab) => tab.key === key);
}

// ── Gestures ────────────────────────────────────────────────────────────────

/** Travel before the axis is picked, in px. */
export const DIRECTION_LOCK_PX = 10;
/** Horizontal wins only when |dx| beats |dy| by this much. */
export const HORIZONTAL_BIAS = 1.2;
/** Release past this share of the width goes to the next page. */
export const SETTLE_DISTANCE = 0.5;
/** Or a flick faster than this, in px per second. */
export const SETTLE_VELOCITY = 500;
/** How far you can pull past Artists or past Team, in px. */
export const RUBBER_BAND_PX = 24;

export type GestureAxis = 'undecided' | 'horizontal' | 'vertical';

/** After 10px of travel, pick the axis once; it holds until the finger lifts. */
export function lockDirection(dx: number, dy: number): GestureAxis {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.hypot(ax, ay) < DIRECTION_LOCK_PX) return 'undecided';
  return ax > HORIZONTAL_BIAS * ay ? 'horizontal' : 'vertical';
}

/**
 * The finger's drag, in px, after the edges are applied: past the first or the
 * last page it gives way and stops at 24px.
 */
export function clampDrag(dx: number, index: number, count: number): number {
  const atStart = index <= 0 && dx > 0;
  const atEnd = index >= count - 1 && dx < 0;
  if (!atStart && !atEnd) return dx;
  const sign = dx > 0 ? 1 : -1;
  const pulled = Math.abs(dx);
  // A soft give: half the travel, never more than the band.
  return sign * Math.min(RUBBER_BAND_PX, pulled * 0.5);
}

/** Where a released drag settles: the next page, the previous one, or back. */
export function settleIndex(input: {
  index: number;
  count: number;
  dx: number;
  width: number;
  velocity: number;
}): number {
  const { index, count, dx, width, velocity } = input;
  const share = width > 0 ? -dx / width : 0;
  let target = index;
  if (share > SETTLE_DISTANCE || velocity < -SETTLE_VELOCITY) target = index + 1;
  else if (share < -SETTLE_DISTANCE || velocity > SETTLE_VELOCITY) target = index - 1;
  return Math.max(0, Math.min(count - 1, target));
}

// ── The one spring ──────────────────────────────────────────────────────────

/** One spring drives the pages, the indicator and the card. ≈350ms, no overshoot. */
export const SPRING = { stiffness: 380, damping: 34, mass: 1 } as const;

export type SpringState = { position: number; velocity: number };

/**
 * One step of the spring toward `target`, semi-implicit Euler. `position` and
 * `velocity` are in whatever unit the caller animates (pages, here), velocity
 * per second. Small steps (<= 1/60s) keep it stable.
 */
export function springStep(state: SpringState, target: number, dt: number): SpringState {
  const { stiffness, damping, mass } = SPRING;
  const force = -stiffness * (state.position - target) - damping * state.velocity;
  const velocity = state.velocity + (force / mass) * dt;
  const position = state.position + velocity * dt;
  return { position, velocity };
}

/** Close enough to stop: within a thousandth of a page and nearly still. */
export function springAtRest(state: SpringState, target: number): boolean {
  return Math.abs(state.position - target) < 0.001 && Math.abs(state.velocity) < 0.01;
}

/** The indicator between two tabs: x and width lerp with the pages. */
export function lerpIndicator(
  rects: readonly { left: number; width: number }[],
  progress: number
): { left: number; width: number } {
  if (rects.length === 0) return { left: 0, width: 0 };
  const clamped = Math.max(0, Math.min(rects.length - 1, progress));
  const i = Math.floor(clamped);
  const j = Math.min(i + 1, rects.length - 1);
  const f = clamped - i;
  return {
    left: rects[i].left + (rects[j].left - rects[i].left) * f,
    width: rects[i].width + (rects[j].width - rects[i].width) * f,
  };
}

// ── Deep links inside UrgAns ────────────────────────────────────────────────

export type UrgansLink = { session: string | null; message: string | null; fromCard: string | null };

/** /dashboard/urgans?s=<chat>, ?m=<message> and ?from=card:<id>. */
export function readUrgansLink(search: string | URLSearchParams | null | undefined): UrgansLink {
  const params = typeof search === 'string' || !search ? new URLSearchParams(search ?? '') : search;
  const from = params.get('from');
  return {
    session: params.get('s') || null,
    message: params.get('m') || null,
    fromCard: from && from.startsWith('card:') ? from.slice('card:'.length) || null : null,
  };
}

/** The short role line under the name in the avatar menu. */
export function describeRole(role: string | null | undefined): string | null {
  const value = String(role || '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'artist-manager' || value === 'manager') return 'Manager';
  if (value === 'artist') return 'Artist';
  if (value === 'label') return 'Label';
  if (value === 'curator') return 'Curator';
  return null;
}

/** Up to two initials from a name, for the avatar. */
export function initialsFor(name: string | null | undefined): string {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : words[0][1] ?? '';
  return (first + last).toUpperCase();
}
