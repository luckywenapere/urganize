'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@/components/icons';
import { readPreviousLocation } from '@/lib/nav-history';
import { useAuthStore } from '@/lib/auth-store';
import { getRolePermissions } from '@/lib/role-permissions';
import { SettingsPageSkeleton } from '@/components/loading/SettingsPageSkeleton';
import { getAccessToken } from '@/components/settings/getAccessToken';
import {
  SETTINGS_TABS,
  SETTINGS_TAB_LABELS,
  useSettingsTab,
  type SettingsTab,
} from '@/components/settings/useSettingsTab';
import { DIRECTORY_SETTINGS_ANCHOR } from '@/lib/person-profile';

import { useTeammates } from '@/components/settings/useTeammates';
import { useWorkspaceSettings } from '@/components/settings/useWorkspaceSettings';
import { AccountTab } from '@/components/settings/tabs/AccountTab';
import { WorkspaceTab } from '@/components/settings/tabs/WorkspaceTab';
import { TeamTab } from '@/components/settings/tabs/TeamTab';
import { NotificationsTab } from '@/components/settings/tabs/NotificationsTab';

// 2026-08-13: Settings was one flat column of twelve hairline-divided sections
// with no grouping and no page title — rare admin work (Teammates) led it while
// frequent trivia (Appearance) sat sixth, three notification toggles were spread
// apart, and release deletion sat between two preference switches and the
// password form. Founder call: four tabs. This file is now the shell — the
// section state it used to own lives in useWorkspaceSettings / useTeammates, and
// the JSX lives in components/settings/tabs.

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);
  const { activeTab, selectTab } = useSettingsTab();

  const rolePermissions = getRolePermissions(user?.role);
  const isManagerAccount = rolePermissions.role === 'manager';
  const isArtistAccount = user?.role === 'artist';

  // Hoisted, resolved ONCE per mount rather than once per section — the
  // mount-time loaders in the two hooks below fire within milliseconds of each
  // other, so this dedupes near-simultaneous calls to the same
  // supabase.auth.getSession(), not a page-wide cache. Click-triggered handlers
  // (invite, upload, etc.) still fetch their own token fresh — see
  // components/settings/getAccessToken.ts.
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
    }
  }, [authLoading, router, user]);

  // Keyed on the user's ID, not the user object: background auth refreshes
  // (token refresh, window refocus) replace the store's user object with a
  // fresh identity for the same person, and keying on the object re-fired
  // every loader below — sections visibly flashed back to their loading
  // states mid-session with no user action. Same person = same effects.
  const userId = user?.id || '';

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getAccessToken().then((token) => {
      if (!cancelled) setAccessToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Both called unconditionally, NOT per tab: the fetches keep firing on page
  // mount exactly as they did before tabs, so switching tabs never pays a round
  // trip. (The two sections that fetch for themselves — ReleasesSection's
  // command-center load and the push-status probe — do now run on their tab's
  // first open instead of page mount. Both are recency-guarded or
  // skeleton-covered, so that's a cost worth the simpler ownership.)
  const teammates = useTeammates(userId, accessToken);
  const workspace = useWorkspaceSettings(userId, accessToken);

  // Legacy deep-link support: `/settings#teammates` was the one addressable
  // spot on the old flat page. UrgAns's invite banner now links straight to
  // `?tab=team`, but stale entries can still arrive from an installed PWA's
  // history, a bookmark, or an older conversation transcript.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#teammates') {
      router.replace('/settings?tab=team', { scroll: false });
    }
  }, [router]);

  // `/settings#directory` — the directory's "Add yourself" (2026-09-06).
  //
  // A client-side push does not scroll to a hash the way a document load does,
  // and this section is fifth of twelve in the Account tab, so without this the
  // button appears to do nothing on a phone. That is how it was reported.
  //
  // No tab redirect needed, unlike #teammates above: the section lives in
  // Account, which is the default tab, so a bare /settings#directory is
  // already on the right one.
  //
  // Deferred a frame because the section renders a fixed-height skeleton until
  // its own fetch resolves; scrolling in the same tick lands above where the
  // heading settles. `block: 'start'` rather than centre so the heading is the
  // first thing under the topbar.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== `#${DIRECTORY_SETTINGS_ANCHOR}`) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(DIRECTORY_SETTINGS_ANCHOR)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // SSR serializes this skeleton into the HTML (auth state is client-only, so
  // the server never knows the user); hydration is a no-op reconciliation — no
  // shimmer restart, no blank gap. app/settings/loading.tsx renders the same
  // skeleton for the route-segment fallback. Stays visible until auth resolves
  // AND the user is known.
  if (authLoading || !user) {
    return (
      <SettingsPageSkeleton
        tab={activeTab}
        isManagerAccount={isManagerAccount}
        isArtistAccount={isArtistAccount}
      />
    );
  }

  // Pill classes lifted from TasksPanel's scene pills so the two tab-like rows
  // in the app read as one language. `shrink-0 whitespace-nowrap` matter: this
  // row is a horizontal scroller, and without them a flex child compresses and
  // wraps its own label instead of scrolling off-screen.
  //
  // `px-2.5` below `sm` is the one deliberate divergence from that shared
  // language, and it exists to keep all four pills on screen without scrolling
  // on a phone. Measured at a 375px layout width: `main`'s `px-4` leaves the row
  // 343px, and the four labels need ~323px at `px-3` — fits, but only by ~5px at
  // the 360px width much of Android reports. Trimming 2px of padding per side
  // buys ~22px, which clears 360px comfortably. Restored to `px-3` at `sm`+,
  // where there is width to spare and matching TasksPanel matters more.
  const pillClass = (tab: SettingsTab) =>
    `motion-focus motion-press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold transition-colors sm:px-3 ${
      activeTab === tab
        ? 'border-brand bg-brand/10 text-content-primary'
        : 'border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover'
    }`;

  return (
    <main className="text-content-primary">
      {/* Outer chrome wrapper. NO max-width — the outer page width is owned
          by AppShell's mx-auto max-w-[1440px] wrapper (see AppShell.tsx
          PAGE WIDTH SOURCE OF TRUTH). `sm:px-6 pb-24 pt-6` matches
          WorkspaceView so Dashboard ↔ Settings navigation does not jump.
          `relative` is here so the decorative blobs can anchor to the
          full outer width (not the narrower inner form column). */}
      <div className="relative pb-24 pt-6 sm:px-6">
        <div className="urg-blob pointer-events-none absolute -right-16 -top-12 h-52 w-52 rounded-full bg-brand/15 blur-3xl" />
        <div className="urg-blob pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-status-info/12 blur-3xl" />

        {/* Inner form wrapper. Redesigned 2026-07-23 (founder call): the
            boxed two-column card collage read as plastic. Sections are flat —
            divided by hairline rules (Linear/PostHog style), mono uppercase
            kickers for section titles, per the Brand Bible. The column is
            760px to suit the single-column rhythm. */}
        <div className="relative mx-auto w-full max-w-[760px]">
          {/* The h1 is real now (2026-08-13). AppTopbar deliberately maps
              /settings to an empty title/eyebrow, so before this the word
              "Settings" appeared nowhere on the page except the browser tab —
              twelve equally-quiet section kickers and nothing to orient
              against. The BACK button (founder request, 2026-07-23) returns to
              the exact page the user came from (via lib/nav-history), falling
              back to the workspace when Settings was opened directly. */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-content-primary">
              Settings
            </h1>
            <button
              type="button"
              onClick={() => {
                const previous = readPreviousLocation();
                router.push(previous && !previous.startsWith('/settings') ? previous : '/dashboard');
              }}
              className="motion-focus motion-press inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-stroke-default bg-bg-surface px-4 py-2 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
          </div>

          {/* Tab row. All four always render: Workspace always holds Releases
              and Notifications always holds the Motivation row, so no tab can
              resolve to an empty page. */}
          <div
            role="tablist"
            aria-label="Settings sections"
            className="mb-2 flex gap-1.5 overflow-x-auto pb-1 sm:gap-2"
          >
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => selectTab(tab)}
                className={pillClass(tab)}
              >
                {SETTINGS_TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          {/* Only the active tab renders (conditional, not CSS-hidden) — the
              point of the split is that the other nine sections aren't there. */}
          {activeTab === 'account' && <AccountTab />}
          {activeTab === 'workspace' && <WorkspaceTab workspace={workspace} />}
          {activeTab === 'team' && (
            <TeamTab
              teammates={teammates.teammates}
              isLoadingTeammates={teammates.isLoadingTeammates}
              onTeammatesChange={teammates.setTeammates}
              onRefetch={teammates.refetch}
              seatLimit={teammates.seatLimit}
              artists={workspace.artists}
            />
          )}
          {activeTab === 'notifications' && <NotificationsTab />}
        </div>
      </div>
    </main>
  );
}
