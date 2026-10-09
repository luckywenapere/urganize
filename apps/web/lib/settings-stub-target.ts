import {
  SETTINGS_MENU,
  legacySettingsTarget,
  readSettingsRequest,
  type SettingsRequest,
} from '@/lib/settings-nav';
import { SETTINGS_SEARCH_ENTRIES } from '@/lib/settings-search';

// Where a URL that names Settings as a PATH should open the pop-up (2026-10-09).
//
// Settings is a pop-up over /dashboard (`?settings=<segment>`), so neither
// `/settings` nor `/dashboard/settings` is a page. Both are client redirect
// stubs that hand off to `/dashboard?settings=…`. `/dashboard/settings` had no
// route at all until v1.92.6: it is the URL people guess (every other app page
// lives under /dashboard), and because `canHostSettings` accepts any
// `/dashboard…` path, opening Settings from that 404 kept the 404 under the
// pop-up — "Page not found | Urganize" in the tab, and a dead page on reload.
//
// Lives in its own file, not settings-nav.ts, because it reads the search
// index's section ids and settings-search.ts already imports settings-nav.ts.

/**
 * In order, the most specific wins:
 *
 * 1. `?settings=<segment>` (+ `&section=`) — the pop-up's own URL, typed or
 *    reloaded on the wrong path. Kept as is; an unknown value is the menu,
 *    exactly as it would be on /dashboard.
 * 2. The old `/settings` links — `#teammates`, `?tab=workspace#brand-colors` —
 *    through `legacySettingsTarget`, unchanged.
 * 3. A hash naming any section the pop-up can scroll to (`#delete-rollouts`),
 *    opened on the segment that holds it.
 * 4. Otherwise the menu (General on a wide screen).
 */
export function settingsStubTarget(
  search: string,
  hash: string
): { segment: SettingsRequest; section: string | null } {
  const requested = readSettingsRequest(new URLSearchParams(search.replace(/^\?/, '')));
  if (requested) return { segment: requested.request, section: requested.section };

  const legacy = legacySettingsTarget(search, hash);
  if (legacy.segment !== SETTINGS_MENU || legacy.section) return legacy;

  const id = hash.replace(/^#/, '');
  const entry = id ? SETTINGS_SEARCH_ENTRIES.find((candidate) => candidate.section === id) : undefined;
  if (entry) return { segment: entry.segment, section: id };

  return { segment: SETTINGS_MENU, section: null };
}
