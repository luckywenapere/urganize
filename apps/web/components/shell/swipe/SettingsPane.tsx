'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Search } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
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
import { AdminSegment } from '@/components/settings/segments/AdminSegment';
import { ArtistsBrandSegment } from '@/components/settings/segments/ArtistsBrandSegment';
import { BillingSegment } from '@/components/settings/segments/BillingSegment';
import { ConnectionsSegment } from '@/components/settings/segments/ConnectionsSegment';
import { DirectorySegment } from '@/components/settings/segments/DirectorySegment';
import { GeneralSegment } from '@/components/settings/segments/GeneralSegment';
import { NotificationsSegment } from '@/components/settings/segments/NotificationsSegment';
import { SecuritySegment } from '@/components/settings/segments/SecuritySegment';
import { UrgansSegment } from '@/components/settings/segments/UrgansSegment';
import { MenuBody } from './AvatarMenu';

/**
 * The Settings page (Nov 2, 2026, founder approved docs/mocks/settings-page):
 * the fourth page of the phone's swipe row, after Rollouts, opened from your
 * photo. The tabs stay on top and your photo carries a ring while it shows.
 * A row opens its setting inside this page, with an arrow back to the list.
 * The search bar sits at the bottom and stays there (founder). Team opens its
 * own page, as before. On a computer Settings is still the pop-up.
 */
export function SettingsPane({ showHelp }: { showHelp: boolean }) {
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

  if (target) {
    return (
      <div className="swipe-page mx-auto w-full max-w-[40rem] px-5">
        <button
          type="button"
          onClick={() => setTarget(null)}
          className="motion-focus -ml-1 mt-2 flex min-h-11 items-center gap-1 rounded-md pr-2 text-sm text-content-tertiary"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          Settings
        </button>
        <h2 className="mt-1 font-display text-2xl text-content-primary">{SETTINGS_SEGMENT_LABELS[target.segment]}</h2>
        <div className="mt-4">{renderSegment(target.segment, workspace)}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[40rem] flex-col px-5">
      <h2 className="mb-3 mt-3 font-display text-2xl text-content-primary">Settings</h2>
      <div className="flex-1">
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
      {/* The search stays at the bottom of the page (founder, Nov 2, 2026). */}
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
    </div>
  );
}

function renderSegment(segment: SettingsSegment, workspace: ReturnType<typeof useWorkspaceSettings>) {
  switch (segment) {
    case 'general':
      return <GeneralSegment />;
    case 'notifications':
      return <NotificationsSegment />;
    case 'artists':
      return <ArtistsBrandSegment workspace={workspace} />;
    case 'urgans':
      return <UrgansSegment />;
    case 'directory':
      return <DirectorySegment />;
    case 'admin':
      return <AdminSegment />;
    case 'billing':
      return <BillingSegment />;
    case 'connections':
      return <ConnectionsSegment />;
    case 'security':
      return <SecuritySegment />;
    case 'team':
      // Team is its own page; its row links there, so this is never shown.
      return null;
  }
}
