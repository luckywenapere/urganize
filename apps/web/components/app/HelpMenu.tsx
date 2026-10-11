'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { openExternalUrl } from '@/lib/external-link';
import { CommunityIcon, ContactIcon, DocsIcon, ReportIcon, TourIcon } from '@/components/app/BrandIcons';
import { useReportIssueStore } from '@/stores/useReportIssueStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTourStore } from '@/stores/useTourStore';
import { ROLLOUT_TOUR_STEPS } from '@/lib/tours';

// In-app issue reporting. The dialog is mounted once by AppShell and opened
// through the store — this menu is one of its two entry points, the other
// being Settings → Account (which is what makes it reachable on a phone, since
// this launcher is `hidden md:block`).
const REPORT_ISSUE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_REPORT_ISSUE === 'true';

// Replay for the guided tours. This is the `md+` entry point; Settings →
// Account is the other one, and is what makes replay reachable on a phone
// (this launcher is `hidden md:block`).
const TOURS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TOURS === 'true';

// The keyboard-shortcuts panel (and its "?" hotkey + menu item) was removed
// 2026-07-23 (founder call) — the menu is Docs / Contact plus the
// Community link (Settings lives ONLY in the account/profile menu now —
// founder call, removing the duplicate entry). Restore from git history if
// a shortcuts panel ever returns.

function openExternalLink(url: string) {
  void openExternalUrl(url);
}

function ItemIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stroke-subtle bg-bg-hover text-content-secondary group-hover:text-content-primary">
      {children}
    </span>
  );
}

function HelpMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[40px] w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-xs text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
    >
      <ItemIcon>{icon}</ItemIcon>
      <span className="min-w-0 flex-1 font-sans">{label}</span>
    </button>
  );
}

export function HelpMenu() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const openReportIssue = useReportIssueStore((state) => state.openReportIssue);
  const router = useRouter();
  const startTour = useTourStore((state) => state.start);
  const firstReleaseId = useReleaseStore((state) => state.releases[0]?.id ?? null);

  const menuGroups = useMemo(
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

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        // Back to the button, so a keyboard user is not dropped at the top.
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const runMenuAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  // Lives in the topbar's right cluster since 2026-07-23 (founder call) —
  // the launcher keeps the quiet mono "?" it had bottom-left (that
  // understatement IS the house look; see the Brand Bible notes in
  // globals.css), it just sits with the rest of the navigation now and the
  // menu drops DOWN instead of up.
  return (
    <div ref={containerRef} className="relative hidden shrink-0 md:block">
      {/* A disclosure, not a role="menu": a menu promises arrow-key movement
          between its items, which this list never had, and a screen reader
          switches into menu behaviour on the strength of the role. */}
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open help menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => setIsOpen((current) => !current)}
        className="motion-focus grid h-10 w-10 place-items-center rounded-full font-mono text-[11px] text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary"
      >
        ?
      </button>

      {isOpen ? (
        <div
          id={panelId}
          role="group"
          aria-label="Help"
          className="animate-menu-down absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl border border-stroke-default bg-bg-elevated p-2 shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]"
        >
          {menuGroups.map((group, groupIndex) => (
            <div key={`help-group-${groupIndex}`}>
              {group.map((item) => (
                <HelpMenuItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => runMenuAction(item.onClick)}
                />
              ))}
              {groupIndex < menuGroups.length - 1 ? <div className="my-2 h-px bg-stroke-subtle" /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
