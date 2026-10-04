import { normalizeAppRole } from '@/lib/role-permissions';

// The settings pop-up's map (2026-09-29).
//
// Settings was a full page at /settings with four tabs, and the Account tab
// alone stacked thirteen sections. It is a pop-up now: a left list of nine
// segments and one pane, opened over whatever page the person is on. Pure and
// in lib/ on purpose — vitest collects lib/**/*.test.ts and this repo has no
// component tests, so the rules that decide what a person sees, where a link
// lands and how the URL is written are only checkable if they live here.

/** The URL param that opens the pop-up and names what is showing in it. */
export const SETTINGS_PARAM = 'settings';

/** Optional: an element id inside the segment to scroll to (a deep link). */
export const SETTINGS_SECTION_PARAM = 'section';

/**
 * The pseudo-segment for "just open it". On a phone it is the list of segments;
 * on a wide screen it resolves to the first one, because that layout shows the
 * list and a pane together and an empty pane would be a dead end.
 */
export const SETTINGS_MENU = 'menu' as const;

/**
 * In the founder's order: everyday settings first, money and the irreversible
 * things last. Directory and UrgAns only appear while their features are on.
 */
export const SETTINGS_SEGMENTS = [
  'general',
  'notifications',
  'team',
  'artists',
  'urgans',
  'directory',
  'billing',
  'connections',
  'security',
] as const;

export type SettingsSegment = (typeof SETTINGS_SEGMENTS)[number];

/** What `?settings=` can hold. */
export type SettingsRequest = SettingsSegment | typeof SETTINGS_MENU;

export const SETTINGS_SEGMENT_LABELS: Record<SettingsSegment, string> = {
  general: 'General',
  notifications: 'Notifications',
  team: 'Team',
  artists: 'Artists & brand',
  urgans: 'UrgAns',
  directory: 'Directory',
  billing: 'Billing',
  connections: 'Connections & data',
  security: 'Security & account',
};

/** One line under each name in the phone's list. Plain words, on purpose. */
export const SETTINGS_SEGMENT_HINTS: Record<SettingsSegment, string> = {
  general: 'Your name, theme and help',
  notifications: 'What we send you, and when',
  team: 'Who is on your team',
  artists: 'Artists, logo and colors',
  urgans: 'Teach UrgAns about your team',
  directory: 'How other teams can find you',
  billing: 'Your plan and trial',
  connections: 'Connected apps and your data',
  security: 'Password and deleting things',
};

const isSegment = (value: string | null | undefined): value is SettingsSegment =>
  Boolean(value) && (SETTINGS_SEGMENTS as readonly string[]).includes(value as string);

// ── Who sees what ───────────────────────────────────────────────────────────

/**
 * The feature flags that decide whether a segment has anything in it. Read once
 * by the caller (see `readSettingsFlags`) and passed in, so the rules below
 * stay testable in both states without stubbing the environment.
 */
export type SettingsFlags = {
  directory: boolean;
  teamBrief: boolean;
  /** The roster and team identity. */
  workspace: boolean;
  pressKits: boolean;
  mcpConnect: boolean;
  dataExport: boolean;
};

/**
 * Read at call time, not module scope, and each as a literal `process.env`
 * access — Next only inlines `NEXT_PUBLIC_*` when it can see the whole name.
 */
export function readSettingsFlags(): SettingsFlags {
  return {
    directory: process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true',
    teamBrief: process.env.NEXT_PUBLIC_FEATURE_TEAM_BRIEF === 'true',
    workspace: process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true',
    pressKits: process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true',
    mcpConnect: process.env.NEXT_PUBLIC_FEATURE_MCP_CONNECT === 'true',
    dataExport: process.env.NEXT_PUBLIC_FEATURE_DATA_EXPORT === 'true',
  };
}

export type SettingsViewer = { role: string | null | undefined };

/**
 * The segments this person gets, in order. Founder call: hide what somebody
 * cannot change rather than show a control the server will refuse.
 *
 * - Team and Artists & brand are the manager's (`canManageArtists`, and invites
 *   were already manager-only).
 * - Billing goes to the accounts that can own and pay for a plan: a manager, or
 *   an artist who runs their own team. A teammate on somebody else's plan has
 *   nothing to change there. (This is the one call the founder did not make
 *   explicitly; it is here in one place so it is a one-line change.)
 * - General, Notifications and Security & account are everyone's, and are
 *   never flagged off, so the pop-up can never open empty.
 *
 * A curator-only account gets nothing: it has no workspace chrome at all and
 * its own settings live under /curator.
 */
export function visibleSettingsSegments(
  viewer: SettingsViewer,
  flags: SettingsFlags
): SettingsSegment[] {
  const role = normalizeAppRole(viewer.role);
  if (role === 'curator') return [];

  const isManager = role === 'manager';
  const ownsPlan = isManager || role === 'artist';

  const wanted: Record<SettingsSegment, boolean> = {
    general: true,
    notifications: true,
    team: isManager,
    artists: isManager && (flags.workspace || flags.pressKits),
    urgans: flags.teamBrief,
    directory: flags.directory,
    billing: ownsPlan,
    connections: flags.mcpConnect || flags.dataExport,
    security: true,
  };

  return SETTINGS_SEGMENTS.filter((segment) => wanted[segment]);
}

/**
 * Deleting rollouts is a danger-zone row for accounts that can own one. A
 * teammate or viewer has none of their own to delete (the list is filtered to
 * rollouts you own), so the row would only ever say "No rollouts yet".
 */
export function canDeleteRollouts(role: string | null | undefined): boolean {
  const normalized = normalizeAppRole(role);
  return normalized === 'manager' || normalized === 'artist';
}

// ── Where it can open ───────────────────────────────────────────────────────

/**
 * The pop-up is mounted by AppShell only on pages that carry app chrome — the
 * dashboard routes, and the old /settings route while its stub redirects. From
 * anywhere else (the payment callback, an admin page) opening it on the current
 * URL would set a param nothing reads, so those callers go to the dashboard.
 */
export function canHostSettings(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname.startsWith('/dashboard') || pathname === '/settings';
}

/**
 * True for a plain left click, the only one an in-app link should intercept.
 * A modified click (new tab, new window, download) and a non-primary button
 * must keep meaning what the browser says they mean — which is why the entry
 * points stay real links pointing at a real URL rather than becoming buttons.
 */
export function isPlainLeftClick(event: {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * A link clicked INSIDE the pop-up: where should it really go? Null means leave
 * it alone (another tab, a download, another site, or a link that opens or
 * re-points the pop-up itself). Otherwise the path to push — after the pop-up's
 * own history entry has been replaced, so Back never returns to an open Settings.
 */
export function settingsLeaveHref(
  anchor: { href: string; target?: string | null; download?: boolean },
  baseUrl: string
): string | null {
  if (anchor.download || anchor.target === '_blank') return null;
  let url: URL;
  try {
    url = new URL(anchor.href, baseUrl);
  } catch {
    return null;
  }
  if (url.origin !== new URL(baseUrl).origin) return null;
  if (url.searchParams.has(SETTINGS_PARAM)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

// ── Reading the URL ─────────────────────────────────────────────────────────

type ParamReader = { get(name: string): string | null };

export type SettingsUrlState = {
  request: SettingsRequest;
  section: string | null;
};

/**
 * Null means closed. Present-but-unknown (empty, hand-typed, a segment removed
 * in a later release) opens at the menu, so a stale link still lands on
 * something real — the same fallback the old `?tab=` had.
 */
export function readSettingsRequest(params: ParamReader): SettingsUrlState | null {
  const raw = params.get(SETTINGS_PARAM);
  if (raw === null) return null;
  return {
    request: isSegment(raw) ? raw : SETTINGS_MENU,
    section: params.get(SETTINGS_SECTION_PARAM) || null,
  };
}

/**
 * What to actually show. A segment this person cannot see (a teammate opening
 * `?settings=team` from a forwarded link) falls back to the menu rather than
 * showing an empty or forbidden pane.
 */
export function resolveSettingsView(
  request: SettingsRequest,
  visible: readonly SettingsSegment[]
): SettingsSegment | typeof SETTINGS_MENU {
  if (request === SETTINGS_MENU) return SETTINGS_MENU;
  return visible.includes(request) ? request : SETTINGS_MENU;
}

/**
 * The wide layout has no "menu with nothing selected" state, so it shows the
 * first visible segment instead. Null only when there is nothing to show.
 */
export function resolveDesktopSegment(
  view: SettingsSegment | typeof SETTINGS_MENU,
  visible: readonly SettingsSegment[]
): SettingsSegment | null {
  if (view !== SETTINGS_MENU) return view;
  return visible[0] ?? null;
}

// ── Writing the URL ─────────────────────────────────────────────────────────

export type SettingsTarget = {
  segment?: SettingsRequest;
  section?: string | null;
};

const withSearch = (pathname: string, params: URLSearchParams) => {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

/**
 * The URL that opens (or re-points) the pop-up on the page the person is
 * already on. Every other param is kept — a release scope or an open scene must
 * survive opening Settings over it — and a section left over from a previous
 * segment is dropped unless the new target names one.
 */
export function buildSettingsUrl(
  pathname: string,
  search: string,
  target: SettingsTarget = {}
): string {
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  params.set(SETTINGS_PARAM, target.segment ?? SETTINGS_MENU);
  if (target.section) {
    params.set(SETTINGS_SECTION_PARAM, target.section);
  } else {
    params.delete(SETTINGS_SECTION_PARAM);
  }
  return withSearch(pathname, params);
}

/** Closing removes the two params and nothing else. */
export function closeSettingsUrl(pathname: string, search: string): string {
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  params.delete(SETTINGS_PARAM);
  params.delete(SETTINGS_SECTION_PARAM);
  return withSearch(pathname, params);
}

/**
 * For callers that are not on a page with app chrome (the payment callback) or
 * that only know a destination, not where they are. The dashboard is where the
 * pop-up can always open.
 */
export function settingsDeepLink(target: SettingsTarget = {}): string {
  return buildSettingsUrl('/dashboard', '', target);
}

// ── Old /settings links ─────────────────────────────────────────────────────

const LEGACY_TAB_SEGMENT: Record<string, SettingsSegment> = {
  account: 'general',
  workspace: 'artists',
  team: 'team',
  notifications: 'notifications',
};

const LEGACY_ANCHOR_TARGET: Record<string, { segment: SettingsSegment; section: string }> = {
  teammates: { segment: 'team', section: 'teammates' },
  'team-logins': { segment: 'team', section: 'team-logins' },
  directory: { segment: 'directory', section: 'directory' },
  'brand-colors': { segment: 'artists', section: 'brand-colors' },
  'connected-apps': { segment: 'connections', section: 'connected-apps' },
};

/**
 * Where an old `/settings…` link should land in the pop-up. The hash wins over
 * the tab: it is the more specific of the two, and where both were present they
 * agreed (`?tab=workspace#brand-colors`). Plain `/settings` goes to the menu,
 * which is what the topbar's "You" now does too.
 *
 * Client-side only, because a URL hash never reaches the server — which is why
 * the stub page has to be a client component.
 */
export function legacySettingsTarget(
  search: string,
  hash: string
): { segment: SettingsRequest; section: string | null } {
  const anchor = LEGACY_ANCHOR_TARGET[hash.replace(/^#/, '')];
  if (anchor) return anchor;

  const tab = new URLSearchParams(search.replace(/^\?/, '')).get('tab');
  const segment = tab ? LEGACY_TAB_SEGMENT[tab] : undefined;
  return { segment: segment ?? SETTINGS_MENU, section: null };
}
