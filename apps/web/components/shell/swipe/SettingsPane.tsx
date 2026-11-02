'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Search } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useSwipeNavStore } from '@/stores/useSwipeNavStore';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { useSettingsPageStore } from '@/stores/useSettingsPageStore';
import {
  SETTINGS_SEGMENT_LABELS,
  readSettingsFlags,
  visibleSettingsSegments,
  type SettingsSegment,
} from '@/lib/settings-nav';
import { searchSettings } from '@/lib/settings-search';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { useWorkspaceSettings } from '@/components/settings/useWorkspaceSettings';
import { ArtistsBrandSegment } from '@/components/settings/segments/ArtistsBrandSegment';
import { BillingSegment } from '@/components/settings/segments/BillingSegment';
import { ConnectionsSegment } from '@/components/settings/segments/ConnectionsSegment';
import { DirectorySegment } from '@/components/settings/segments/DirectorySegment';
import { MenuBody } from './AvatarMenu';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { AdminRows, NotificationRows, ProfileRows, SecurityRows, UrgansRows } from './SettingsRows';

/**
 * The Settings page (Nov 2, 2026, founder approved docs/mocks/settings-page):
 * the fourth page of the phone's swipe row, after Rollouts, opened from your
 * photo. The tabs stay on top and your photo carries a ring while it shows.
 * A row opens its setting inside this page, with an arrow back to the list.
 * The search bar sits at the bottom and stays there (founder). Team opens its
 * own page, as before. On a computer Settings is still the pop-up.
 */
/**
 * `split` (Nov 2, 2026, computer layout, founder approved docs/mocks/desktop-nav):
 * on a wide screen the settings list sits on the left with the search at its
 * bottom, and the open setting on the right (Profile until one is picked).
 * Narrower screens behave like the phone page.
 */
export function SettingsPane({ showHelp, split = false }: { showHelp: boolean; split?: boolean }) {
  const isDesktop = useIsDesktopViewport();
  const wide = split && isDesktop;
  const open = useSettingsPageStore((state) => state.open);
  const target = useSettingsPageStore((state) => state.target);
  const setTarget = useSettingsPageStore((state) => state.setTarget);
  const user = useAuthStore((state) => state.user);
  const isAdmin = useWorkspaceIdentityStore((state) => state.isAdmin);
  const userId = user?.id ?? '';
  const flags = useMemo(() => readSettingsFlags(), []);
  const visible = useMemo(
    () => visibleSettingsSegments({ role: user?.role, isAdmin }, flags),
    [user?.role, isAdmin, flags]
  );
  const [query, setQuery] = useState('');
  // Every setting opened while Settings is open stays mounted (hidden), so a
  // half-typed draft survives a trip back to the list, as in the pop-up
  // (Codex review on #1030). Adjusted during render, like the pop-up does.
  const [visited, setVisited] = useState<SettingsSegment[]>([]);
  // On a wide screen something is always open on the right: Profile first.
  const shown = target ?? (wide ? { segment: 'general' as SettingsSegment, section: null } : null);
  if (shown && !visited.includes(shown.segment)) setVisited([...visited, shown.segment]);
  if (!open && visited.length > 0) setVisited([]);
  const results = useMemo(() => searchSettings(query, visible), [query, visible]);

  const [accessToken, setAccessToken] = useState('');
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    void getAccessToken().then((token) => {
      if (!cancelled) setAccessToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);
  const workspace = useWorkspaceSettings(open && visible.includes('artists') ? userId : '', accessToken);

  // Inside one setting nothing swipes: the pager is frozen until you go back.
  const lock = useSwipeNavStore((state) => state.lock);
  const settingShowing = open && target !== null;
  useEffect(() => {
    if (!settingShowing) return;
    return lock();
  }, [settingShowing, lock]);

  // A link to one part of a setting (Appearance, a search result) scrolls to it.
  useEffect(() => {
    if (!target?.section) return;
    const timer = window.setTimeout(() => {
      document.getElementById(target.section as string)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [target]);

  if (!open) return null;

  const openSegment = (segment: SettingsSegment, section: string | null) => {
    setQuery('');
    setTarget({ segment, section });
  };

  if (wide) {
    return (
      <div className="mx-auto grid min-h-full w-full max-w-[1100px] grid-cols-[280px_minmax(0,1fr)] gap-10 px-2">
        <aside className="flex min-h-[calc(100dvh-9rem)] flex-col">
          <h2 className="mb-3 mt-3 font-display text-2xl text-content-primary">Settings</h2>
          <div className="flex-1">
            {query.trim() ? (
              <ul className="rounded-[20px] bg-content-primary/[0.04] px-4">
                {results.map((result) => (
                  <li key={`${result.segment}:${result.section ?? ''}:${result.label}`}>
                    <button
                      type="button"
                      onClick={() => openSegment(result.segment, result.section)}
                      className="motion-focus flex min-h-[48px] w-full items-center justify-between gap-3 border-b border-content-primary/[0.07] text-left last:border-b-0"
                    >
                      <span className="text-[15px] text-content-primary">{result.label}</span>
                      <span className="shrink-0 text-[12px] text-content-tertiary">{result.segmentLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <MenuBody showHelp={showHelp} onClose={() => undefined} onOpenSegment={openSegment} />
            )}
          </div>
          <div className="sticky bottom-0 bg-bg-base pb-4 pt-3">
            <label className="flex h-11 items-center gap-2.5 rounded-full border border-stroke-control bg-bg-surface px-4">
              <Search className="h-[18px] w-[18px] text-content-primary/50" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search settings"
                aria-label="Search settings"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-content-primary placeholder:text-content-tertiary focus:outline-none"
              />
            </label>
          </div>
        </aside>
        <section className="min-w-0 pt-3">
          <h2 className="mb-5 font-display text-2xl text-content-primary">
            {shown ? SETTINGS_SEGMENT_LABELS[shown.segment] : 'Settings'}
          </h2>
          {visited.map((segment) => (
            <div key={segment} className={shown?.segment === segment ? 'max-w-[40rem]' : 'hidden'}>
              {renderSegment(segment, workspace, shown?.segment === segment ? shown.section : null)}
            </div>
          ))}
        </section>
      </div>
    );
  }

  // One tree for the list and the open setting, so the settings opened earlier
  // keep their place in it and are never remounted by a switch (their drafts last).
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[40rem] flex-col px-5">
      {target ? (
        <>
          {/* The founder's reference: a round back button on the left, the
              title centred, full screen with no tabs and no swiping. */}
          <div className="sticky top-0 z-10 -mx-5 grid grid-cols-[44px_1fr_44px] items-center bg-bg-base px-5 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
            <button
              type="button"
              onClick={() => setTarget(null)}
              aria-label="Back to Settings"
              className="motion-press grid h-11 w-11 place-items-center rounded-full bg-content-primary/[0.06] text-content-primary"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h2 className="truncate text-center text-[17px] font-semibold text-content-primary">
              {SETTINGS_SEGMENT_LABELS[target.segment]}
            </h2>
            <span aria-hidden="true" />
          </div>
        </>
      ) : (
        <h2 className="mb-3 mt-3 font-display text-2xl text-content-primary">Settings</h2>
      )}

      <div className={target ? 'hidden' : 'flex-1'}>
        {query.trim() ? (
          results.length === 0 ? (
            <p className="px-1 py-6 text-sm text-content-secondary">Nothing matches that.</p>
          ) : (
            <ul className="rounded-[20px] border border-content-primary/[0.07] bg-content-primary/[0.03] px-4">
              {results.map((result) => (
                <li key={`${result.segment}:${result.section ?? ''}:${result.label}`}>
                  <button
                    type="button"
                    onClick={() => openSegment(result.segment, result.section)}
                    className="motion-focus flex min-h-[56px] w-full items-center justify-between gap-3 border-b border-content-primary/[0.07] text-left last:border-b-0"
                  >
                    <span className="text-[16px] text-content-primary">{result.label}</span>
                    <span className="shrink-0 text-[13px] text-content-tertiary">{result.segmentLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <MenuBody showHelp={showHelp} onClose={() => undefined} onOpenSegment={openSegment} />
        )}
      </div>

      {/* Every setting opened since Settings opened, only the current one shown. */}
      <div className={target ? 'mt-4 pb-10' : 'hidden'}>
        {visited.map((segment) => (
          <div key={segment} className={target?.segment === segment ? '' : 'hidden'}>
            {renderSegment(segment, workspace, target?.segment === segment ? target.section : null)}
          </div>
        ))}
      </div>

      {/* The search stays at the bottom of the page (founder, Nov 2, 2026). */}
      {target ? null : (
        <div className="sticky bottom-0 -mx-5 bg-bg-base px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3">
          <label className="flex h-[50px] items-center gap-2.5 rounded-full border border-stroke-control bg-bg-surface px-4">
            <Search className="h-[19px] w-[19px] text-content-primary/50" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-content-primary placeholder:text-content-tertiary focus:outline-none"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function renderSegment(
  segment: SettingsSegment,
  workspace: ReturnType<typeof useWorkspaceSettings>,
  section: string | null = null
) {
  switch (segment) {
    // Grouped rows on the phone (docs/mocks/settings-rows); the others follow.
    case 'general':
      return <ProfileRows />;
    case 'notifications':
      return <NotificationRows />;
    case 'artists':
      return <ArtistsBrandSegment workspace={workspace} />;
    case 'urgans':
      return <UrgansRows openSection={section} />;
    case 'directory':
      return <DirectorySegment />;
    case 'admin':
      return <AdminRows />;
    case 'billing':
      return <BillingSegment />;
    case 'connections':
      return <ConnectionsSegment />;
    case 'security':
      return <SecurityRows openSection={section} />;
    case 'team':
      // Team is its own page; its row links there, so this is never shown.
      return null;
  }
}
