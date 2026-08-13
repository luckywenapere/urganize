'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL param naming which group of settings is showing (2026-08-13). Settings
 * was one flat column of twelve hairline-divided sections — identity, workspace
 * admin, team management, appearance, three separate notification toggles,
 * release deletion, credentials, sign-out, account destruction — with no
 * grouping and no page title. Founder call: split it into four tabs.
 *
 * Modeled on `useSceneOverlay` in components/workspace: the active tab is
 * DERIVED from searchParams on every render rather than mirrored into state, so
 * there is structurally no second copy to desync. Browser Back/Forward, a typed
 * URL, a hard refresh, and the legacy `#teammates` redirect landing all resolve
 * through this same read.
 *
 * HISTORY MODEL — replace, always. Unlike scenes there is no open/close pair
 * here: the settings page itself was pushed, and tabs are only ever switched
 * between. Pushing per switch would make Back walk the user backwards through
 * their own tab clicks before it ever left /settings. Replace means Back leaves
 * the page, which is what the Back button in the header does too.
 *
 * ON READING searchParams HERE: CLAUDE.md records that adding `useSearchParams`
 * to a statically prerendered client page makes Next bail out to the nearest
 * Suspense boundary, and that this silently turned /auth's server HTML into a
 * spinner. That trap does not bite here, and the difference is worth stating so
 * nobody "fixes" this by reading the param post-mount:
 *   1. /settings already serves a skeleton as its prerendered HTML —
 *      SettingsPageClient returns SettingsPageSkeleton while auth is
 *      unresolved, and auth state is client-only, so the server never had page
 *      content to lose. app/settings/loading.tsx is the boundary.
 *   2. Nobody unauthenticated ever sees settings, so there is no weak-connection
 *      user who needs real content in the first HTML payload.
 *   3. The param CHANGES during the session (pill clicks, Back/Forward), so a
 *      one-shot `window.location.search` read after mount — what /auth does —
 *      would be exactly the mirrored state this hook exists to avoid.
 */
const TAB_PARAM = 'tab';

export const SETTINGS_TABS = ['account', 'workspace', 'team', 'notifications'] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Account is the default: it holds the controls every account has, and it is
 * where every plain `/settings` link (topbar menu, mobile "You" tab, the
 * post-payment callback) lands. */
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'account';

const isSettingsTab = (value: string | null): value is SettingsTab =>
  Boolean(value) && (SETTINGS_TABS as readonly string[]).includes(value as string);

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  account: 'Account',
  workspace: 'Workspace',
  team: 'Team',
  notifications: 'Notifications',
};

export type SettingsTabState = {
  /** Falls back to Account for an absent OR unrecognized param, so a stale or
   * hand-typed `?tab=billing` shows a real page instead of an empty one. */
  activeTab: SettingsTab;
  selectTab: (tab: SettingsTab) => void;
};

export function useSettingsTab(): SettingsTabState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(TAB_PARAM);
  const activeTab = isSettingsTab(raw) ? raw : DEFAULT_SETTINGS_TAB;

  const selectTab = useCallback(
    (tab: SettingsTab) => {
      const params = new URLSearchParams(searchParams.toString());
      // The default tab drops the param entirely, so the canonical URL for a
      // normal settings visit stays a clean `/settings` — which is what every
      // existing link in the app already points at.
      if (tab === DEFAULT_SETTINGS_TAB) {
        params.delete(TAB_PARAM);
      } else {
        params.set(TAB_PARAM, tab);
      }
      const query = params.toString();
      router.replace(`${pathname ?? '/settings'}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return { activeTab, selectTab };
}
