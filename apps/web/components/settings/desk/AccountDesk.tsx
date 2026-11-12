'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { useSettingsPageStore } from '@/stores/useSettingsPageStore';
import { readSettingsFlags } from '@/lib/settings-nav';
import { isCreditsEnabled } from '@/lib/credits/config';
import {
  DESK_PAGE_LABELS,
  DESK_PAGE_PARAM,
  deskMenu,
  deskMenuPages,
  deskPageForSegment,
  readDeskPageParam,
  type DeskPage,
} from '@/lib/settings-desk';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { useWorkspaceSettings } from '@/components/settings/useWorkspaceSettings';
import { ArtistsBrandSegment } from '@/components/settings/segments/ArtistsBrandSegment';
import { BillingSection } from '@/components/settings/BillingSection';
import { AddonsSection } from '@/components/settings/AddonsSection';
import {
  AdminRows,
  NotificationRows,
  ProfileRows,
  SecurityRows,
  UrgansRows,
} from '@/components/shell/swipe/SettingsRows';
import { SettingsDesk, useDeskSection } from './SettingsDesk';
import { PlanRows } from './PlanRows';

const LEADS: Partial<Record<DeskPage, string>> = {
  artists: 'The artists on your team, your logo and your colors.',
  billing: 'What you pay for and when.',
  ai: 'What AI knows about your team, and how it chases people.',
  profile: 'Your name, photo and email.',
  notifications: 'What we send you, and when.',
  appearance: 'Light or dark.',
  security: 'Your password, your data, and leaving or deleting.',
  admin: 'Internal dashboards.',
};

/**
 * The Account address on a computer (#1226): the settings menu on the left and
 * one page on the right, picked by ?page=. A link from elsewhere that names an
 * old settings segment (useOpenSettings sets it in the store) opens its page.
 */
export function AccountDesk() {
  const params = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const isAdmin = useWorkspaceIdentityStore((state) => state.isAdmin);
  const target = useSettingsPageStore((state) => state.target);
  const flags = useMemo(() => readSettingsFlags(), []);
  const visible = useMemo(
    () => deskMenuPages(deskMenu({ role: user?.role, isAdmin }, flags, { credits: isCreditsEnabled() })),
    [user?.role, isAdmin, flags]
  );

  const param = params.get(DESK_PAGE_PARAM);
  const fromStore = !param && target ? deskPageForSegment(target.segment, target.section) : null;
  const page = readDeskPageParam(param ?? fromStore, visible);
  const section = params.get('section') ?? (fromStore ? target?.section ?? null : null);
  useDeskSection(section);

  // Artists and brand needs the team's settings, read once it is opened.
  const [accessToken, setAccessToken] = useState('');
  const userId = user?.id ?? '';
  useEffect(() => {
    if (page !== 'artists' || !userId || accessToken) return;
    let cancelled = false;
    void getAccessToken().then((token) => {
      if (!cancelled) setAccessToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [page, userId, accessToken]);
  const workspace = useWorkspaceSettings(page === 'artists' ? userId : '', accessToken);

  return (
    <SettingsDesk active={page} title={DESK_PAGE_LABELS[page]} lead={LEADS[page]}>
      {page === 'billing' ? (
        <>
          <BillingSection variant="desk" />
          <PlanRows />
          <div className="mt-4">
            <AddonsSection />
          </div>
        </>
      ) : page === 'artists' ? (
        <ArtistsBrandSegment workspace={workspace} />
      ) : page === 'ai' ? (
        <UrgansRows openSection={section} />
      ) : page === 'notifications' ? (
        <NotificationRows />
      ) : page === 'appearance' ? (
        <ProfileRows part="appearance" />
      ) : page === 'security' ? (
        <SecurityRows openSection={section} />
      ) : page === 'admin' ? (
        <AdminRows />
      ) : (
        <ProfileRows part="profile" />
      )}
    </SettingsDesk>
  );
}
