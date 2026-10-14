'use client';

import { useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { openExternalUrl } from '@/lib/external-link';
import { CommunityIcon, ContactIcon, DocsIcon, ReportIcon, TourIcon } from '@/components/app/BrandIcons';
import { useReportIssueStore } from '@/stores/useReportIssueStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTourStore } from '@/stores/useTourStore';
import { ROLLOUT_TOUR_STEPS } from '@/lib/tours';

// In-app issue reporting. The dialog is mounted once by AppShell and opened
// through the store — the account menu's help rows are one of its two entry
// points, the other being Settings → Account (which is what makes it reachable
// on a phone, where the account menu lives in More instead).
const REPORT_ISSUE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_REPORT_ISSUE === 'true';

// Replay for the guided tours. This is the desktop entry point; Settings →
// Account is the other one, and is what makes replay reachable on a phone.
const TOURS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TOURS === 'true';

// The keyboard-shortcuts panel (and its "?" hotkey + menu item) was removed
// 2026-07-23 (founder call) — the menu is Docs / Contact plus the
// Community link (Settings lives ONLY in the account/profile menu now —
// founder call, removing the duplicate entry). Restore from git history if
// a shortcuts panel ever returns.

function openExternalLink(url: string) {
  void openExternalUrl(url);
}

export type HelpMenuItem = { label: string; icon: ReactNode; onClick: () => void };

/**
 * The help entries, as groups (URG-255, 2026-10-14). The `?` button that used
 * to open them in the top bar is gone: they are rows in the account menu at the
 * foot of the side menu now (WorkspaceMenu), one place for "me, my team, and
 * help". Same entries, same order, same gating. The phone's More sheet
 * (BottomBar) shows the same rows from this same list since 2026-10-14, so
 * the two can never drift apart.
 */
export function useHelpMenuGroups(): HelpMenuItem[][] {
  const openReportIssue = useReportIssueStore((state) => state.openReportIssue);
  const router = useRouter();
  const startTour = useTourStore((state) => state.start);
  const firstReleaseId = useReleaseStore((state) => state.releases[0]?.id ?? null);

  return useMemo<HelpMenuItem[][]>(
    () => [
      [
        // First: the reason most people open this menu is that something is
        // wrong, and a mailto is a worse answer than a form that files the
        // issue for them.
        ...(REPORT_ISSUE_ENABLED
          ? [
              {
                label: 'Report an issue',
                icon: <ReportIcon />,
                onClick: () => openReportIssue('bug'),
              },
            ]
          : []),
        {
          label: 'Docs',
          icon: <DocsIcon />,
          onClick: () => openExternalLink('https://urganize.mintlify.app/'),
        },
        {
          label: 'Contact us',
          icon: <ContactIcon />,
          onClick: () => {
            window.location.href = 'mailto:contact@urganize.app';
          },
        },
      ],
      [
        {
          // Renamed from "The Release Room" (2026-07-23) — same WhatsApp
          // community, plainer name.
          label: 'Community',
          icon: <CommunityIcon />,
          onClick: () => openExternalLink('https://chat.whatsapp.com/DGUGyC2GK3d5v6KPGw5aft'),
        },
      ],
      // Last group: replay is the thing you reach for least, and it is the
      // only group that can be absent. Hidden rather than disabled when there
      // is no rollout to point at — a menu is not the place for a dead row,
      // and Settings carries the explanatory hint instead. (The welcome tour's
      // "Show me the catalog again" row went with that tour on 2026-10-11.)
      ...(TOURS_ENABLED && firstReleaseId
        ? [
            [
              {
                label: 'Show me a rollout again',
                icon: <TourIcon />,
                // Started directly: navigating to a scoped rollout IS the whole
                // precondition.
                onClick: () => {
                  router.push(`/dashboard?release=${firstReleaseId}`);
                  startTour('rollout', ROLLOUT_TOUR_STEPS);
                },
              },
            ],
          ]
        : []),
    ],
    [openReportIssue, startTour, router, firstReleaseId]
  );
}
