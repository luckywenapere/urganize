// Role-based views (URG-260, founder-approved 2026-10-14).
//
// Who someone is changes what the menu leads with. NOTHING IS REMOVED: an area
// a view does not lead with is "tucked", which moves it under a "More" group at
// the end of the menu. A tucked page still opens from a deep link and from the
// command bar's search (lib/app-pages.ts is not filtered), and anyone can switch
// view in Settings.
//
// PURE on purpose, like lib/shell-nav.ts: the view and the flag arrive as
// arguments, so the tests drive every persona without stubbing the
// environment or a store. `readRoleViewsFlag` is the only place the flag is
// read. The nav filter (`applyRoleView`) takes the area list shell-nav already
// builds and returns a new one, so shell-nav itself does not change.

import { isOnboardingPersona, type OnboardingPersona } from './onboarding';
import type { ShellArea, ShellAreaKey, ShellSubTab } from './shell-nav';

export type RoleView = 'artist_manager' | 'label' | 'solo_artist' | 'artist_team' | 'other';

export const ROLE_VIEWS: readonly RoleView[] = [
  'artist_manager',
  'label',
  'solo_artist',
  'artist_team',
  'other',
];

/** The words a person reads, the same ones onboarding's "Who are you?" uses. */
export const ROLE_VIEW_LABELS: Record<RoleView, string> = {
  artist_manager: 'Artist manager',
  label: 'Label',
  solo_artist: 'Solo artist',
  artist_team: 'Artist team',
  other: 'Everything',
};

export const isRoleView = (value: unknown): value is RoleView =>
  typeof value === 'string' && (ROLE_VIEWS as readonly string[]).includes(value);

/** NEXT_PUBLIC_FEATURE_ROLE_VIEWS, inlined at build time. Off means everyone
 *  sees the full app, exactly as before. */
export function readRoleViewsFlag(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_ROLE_VIEWS === 'true';
}

// ---------------------------------------------------------------------------
// Persona resolution
// ---------------------------------------------------------------------------

const PERSONA_VIEW: Record<OnboardingPersona, RoleView> = {
  music_manager: 'artist_manager',
  label_ar: 'label',
  independent_artist: 'solo_artist',
  artist_team: 'artist_team',
  other: 'other',
  // Legacy, no longer offered: a producer keeps the full app.
  producer_beatmaker: 'other',
};

/** The view an account's stored role implies, for accounts that never answered
 *  "Who are you?". Legacy 'manager' accounts get the Label view (founder,
 *  2026-10-14: "yes old too"), matching profileRoleForPersona, which writes
 *  'manager' for a Label answer. */
export function roleViewFromProfileRole(role: string | null | undefined): RoleView {
  switch (String(role ?? '').trim()) {
    case 'artist':
      return 'solo_artist';
    case 'artist-manager':
      return 'artist_manager';
    case 'manager':
      return 'label';
    case 'artist-team':
    case 'team-member':
      return 'artist_team';
    default:
      return 'other';
  }
}

export type RoleViewViewer = {
  role?: string | null;
  onboarding_persona?: string | null;
  /** The Settings override (profiles.role_view). Null or missing = automatic. */
  role_view?: string | null;
};

/** The view the answers imply, ignoring any Settings override: the persona
 *  first, then the stored role. */
export function automaticRoleView(viewer: RoleViewViewer | null | undefined): RoleView {
  if (!viewer) return 'other';
  if (isOnboardingPersona(viewer.onboarding_persona)) return PERSONA_VIEW[viewer.onboarding_persona];
  return roleViewFromProfileRole(viewer.role);
}

/** The view to show: the Settings override when one is saved, otherwise the
 *  automatic one. */
export function resolveRoleView(viewer: RoleViewViewer | null | undefined): RoleView {
  if (viewer && isRoleView(viewer.role_view)) return viewer.role_view;
  return automaticRoleView(viewer);
}

/** What the nav should use: the full app whenever the flag is off. */
export function effectiveRoleView(
  viewer: RoleViewViewer | null | undefined,
  enabled: boolean
): RoleView {
  return enabled ? resolveRoleView(viewer) : 'other';
}

// ---------------------------------------------------------------------------
// What each view leads with
// ---------------------------------------------------------------------------

/** Everything the spec names. Home, rollouts, tasks, press kits, pitching,
 *  notes and UrgAns are never tucked; they are listed so the table reads as
 *  the whole spec. */
export type RoleViewFeature =
  | 'home'
  | 'rollouts'
  | 'tasks'
  | 'press_kits'
  | 'pitching'
  | 'notes'
  | 'urgans'
  | 'artists'
  | 'team'
  | 'catalogue'
  | 'credits'
  | 'opportunities'
  | 'shows'
  | 'audience'
  | 'people'
  | 'directory';

/** Tucked per view. Anything not listed is a default. 'other' tucks nothing. */
const TUCKED: Record<RoleView, readonly RoleViewFeature[]> = {
  artist_manager: ['catalogue', 'credits', 'audience'],
  label: ['opportunities', 'shows'],
  solo_artist: ['artists', 'team', 'people', 'directory'],
  artist_team: ['artists', 'catalogue', 'credits', 'opportunities', 'audience', 'people', 'directory'],
  other: [],
};

export function isTucked(view: RoleView, feature: RoleViewFeature): boolean {
  return TUCKED[view].includes(feature);
}

export function tuckedFeatures(view: RoleView): readonly RoleViewFeature[] {
  return TUCKED[view];
}

// ---------------------------------------------------------------------------
// The nav filter
// ---------------------------------------------------------------------------

/** shell-nav sub-tab keys to the feature they are. */
const TAB_FEATURE: Record<string, RoleViewFeature> = {
  releases: 'rollouts',
  artists: 'artists',
  'press-kits': 'press_kits',
  notes: 'notes',
  people: 'people',
  directory: 'directory',
  shows: 'shows',
  pitching: 'pitching',
};

/** An area with no tabs is one destination; this is the feature it is. An
 *  empty Relationships (its flags off) counts as People, its first tab. */
const AREA_FEATURE: Partial<Record<ShellAreaKey, RoleViewFeature>> = {
  home: 'home',
  urgans: 'urgans',
  relationships: 'people',
  opportunities: 'opportunities',
  audience: 'audience',
};

export const ROLE_VIEW_MORE_KEY = 'more';

/** A tucked destination. `soon` carries an area's coming-soon state (Audience)
 *  through to the phone's More sheet. */
export type TuckedTab = ShellSubTab & { soon: boolean };

/** The "More" group is an ordinary ShellArea (key 'more'), so the top bar,
 *  the tab row and the side menu draw it with no code of their own. */
export function isRoleViewMoreArea(area: { key: string }): boolean {
  return area.key === ROLE_VIEW_MORE_KEY;
}

/**
 * The menu for a view: the same areas in the same order, minus what the view
 * tucks, plus a "More" group at the end holding the tucked destinations in the
 * order they appeared. With nothing tucked (the 'other' view, or flags that
 * leave nothing to tuck) the input comes back unchanged.
 *
 * An area that loses some tabs keeps the rest, points its pill at its first
 * remaining tab, and stops claiming the tucked tabs' paths, so a deep link to a
 * tucked page lights "More" rather than the area it came from. An area that
 * loses every tab moves under More whole.
 */
export function applyRoleView(areas: ShellArea[], view: RoleView): ShellArea[] {
  const tucked: TuckedTab[] = [];
  const kept: ShellArea[] = [];

  for (const area of areas) {
    if (area.subTabs.length === 0) {
      const feature = AREA_FEATURE[area.key];
      if (feature && isTucked(view, feature)) {
        tucked.push({
          key: area.key,
          label: area.label,
          href: area.href,
          isActive: area.isActive,
          soon: !area.live,
        });
      } else {
        kept.push(area);
      }
      continue;
    }

    const keep: ShellSubTab[] = [];
    const gone: ShellSubTab[] = [];
    for (const tab of area.subTabs) {
      const feature = TAB_FEATURE[tab.key];
      (feature && isTucked(view, feature) ? gone : keep).push(tab);
    }
    if (gone.length === 0) {
      kept.push(area);
      continue;
    }
    tucked.push(...gone.map((tab) => ({ ...tab, soon: false })));
    if (keep.length === 0) continue;
    kept.push({
      ...area,
      href: keep[0].href,
      subTabs: keep,
      isActive: (p) => area.isActive(p) && !gone.some((tab) => tab.isActive(p)),
    });
  }

  if (tucked.length === 0) return areas;

  const more: ShellArea = {
    key: ROLE_VIEW_MORE_KEY,
    label: 'More',
    href: tucked[0].href,
    live: true,
    subTabs: tucked,
    isActive: (p) => tucked.some((tab) => tab.isActive(p)),
  };
  return [...kept, more];
}

/** The tucked destinations, for the phone's More sheet (which already lists
 *  the areas the bottom bar does not carry). Empty when nothing is tucked. */
export function tuckedMoreItems(
  areas: ShellArea[]
): Array<{ key: string; label: string; href: string; soon: boolean }> {
  const more = areas.find(isRoleViewMoreArea);
  if (!more) return [];
  return more.subTabs.map((tab) => ({
    key: tab.key,
    label: tab.label,
    href: tab.href,
    soon: (tab as Partial<TuckedTab>).soon === true,
  }));
}

// ---------------------------------------------------------------------------
// Settings copy
// ---------------------------------------------------------------------------

const FEATURE_WORDS: Partial<Record<RoleViewFeature, string>> = {
  artists: 'Artists',
  catalogue: 'Catalogue',
  credits: 'Credits',
  opportunities: 'Opportunities',
  shows: 'Shows',
  audience: 'Audience',
  people: 'People',
  directory: 'Directory',
  team: 'team assignment',
};

/** One plain line for Settings: what this view puts under More. */
export function describeRoleView(view: RoleView): string {
  const words = TUCKED[view].map((feature) => FEATURE_WORDS[feature]).filter(Boolean) as string[];
  if (words.length === 0) return 'Everything is in the menu.';
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `${list} move under More. Nothing is removed.`;
}
