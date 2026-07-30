'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  Disc3,
  FolderOpen,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';

// Release-scoped left side menu (URG-196) — the PostHog main-nav pattern: a
// vertical sidebar of scene links on the left edge of the content,
// collapsible down to an icon rail via the toggle at its foot, active scene
// highlighted. Below lg it flattens into a horizontal pill row above the
// content (a fixed 12rem column would eat a phone's width).
//
// Items are release surfaces, so every entry is flag-gated the same way its
// destination is. A "Dashboard" back-entry sits above the scene links
// (URG-199: the detail page had no labeled route back — only the logo and
// an icon-only topbar button — and the founder got stranded). Because that
// entry is always present the nav always has ≥2 items, so the old
// render-null-below-two rule is gone with the situation that needed it.
//
// Collapse state persists per device via lib/persisted-state.ts, hydrated in
// a mount effect to avoid SSR mismatch (the TasksPanel precedent).
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';
const EPK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';

const NAV_STATE_KEY = 'urganize.release.side-nav';
const NAV_STATE_VERSION = 1;

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

type NavItem = {
  key: string;
  label: string;
  icon: typeof Disc3;
  href: string;
  isActive: (pathname: string) => boolean;
};

type ReleaseSideNavProps = {
  releaseId: string;
};

export function ReleaseSideNav({ releaseId }: ReleaseSideNavProps) {
  const pathname = usePathname() || '';
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const persisted = readPersistedState(NAV_STATE_KEY, NAV_STATE_VERSION, isBoolean);
    if (persisted !== null) {
      setCollapsed(persisted);
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      writePersistedState(NAV_STATE_KEY, NAV_STATE_VERSION, next);
      return next;
    });
  };

  const base = `/dashboard/releases/${releaseId}`;

  const items: NavItem[] = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      icon: ArrowLeft,
      href: '/dashboard',
      // Never highlighted — it's an exit, not a scene of this release.
      isActive: () => false,
    },
    {
      key: 'overview',
      label: 'Overview',
      icon: Disc3,
      href: base,
      isActive: (p) => p === base,
    },
    ...(CONTENT_CALENDAR_ENABLED
      ? [
          {
            key: 'calendar',
            label: 'Content calendar',
            icon: CalendarDays,
            href: `${base}/calendar`,
            isActive: (p: string) => p.startsWith(`${base}/calendar`),
          },
        ]
      : []),
    ...(FILES_ENABLED
      ? [
          {
            key: 'files',
            label: 'Files',
            icon: FolderOpen,
            href: `${base}/files`,
            isActive: (p: string) => p.startsWith(`${base}/files`),
          },
        ]
      : []),
    ...(EPK_ENABLED
      ? [
          {
            key: 'epk',
            label: 'Press kit',
            icon: Newspaper,
            href: `${base}/epk`,
            isActive: (p: string) => p.startsWith(`${base}/epk`),
          },
        ]
      : []),
  ];

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <nav
      aria-label="Release menu"
      className={`flex shrink-0 lg:sticky lg:top-24 lg:h-fit lg:flex-col ${
        collapsed ? 'lg:w-auto' : 'lg:w-48'
      }`}
    >
      <ul className="flex w-full gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname);
          const isExit = item.key === 'dashboard';
          return (
            <li
              key={item.key}
              className={`shrink-0 lg:shrink ${
                // Hairline under the Dashboard exit on desktop so the back
                // path reads as a separate group from this release's scenes.
                isExit ? 'lg:mb-1 lg:border-b lg:border-stroke-subtle lg:pb-1' : ''
              }`}
            >
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                title={collapsed ? item.label : undefined}
                className={`motion-focus flex h-9 items-center gap-2.5 rounded-lg text-sm transition-colors ${
                  collapsed ? 'lg:w-9 lg:justify-center lg:px-0' : ''
                } px-3 ${
                  active
                    ? 'bg-brand/10 font-medium text-brand'
                    : isExit
                      ? 'text-content-tertiary hover:bg-bg-hover hover:text-content-primary'
                      : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className={`whitespace-nowrap ${collapsed ? 'lg:hidden' : ''}`}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Collapse toggle — desktop only; the mobile pill row has nothing to
          collapse. Icon-only above a hairline (URG-199): with a text label
          it rendered in the identical icon+label shape as the nav items
          above it and read as a fifth destination. The aria-label and
          tooltip keep it discoverable and accessible without the text. */}
      <div className="mt-2 hidden border-t border-stroke-subtle pt-2 lg:block">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Expand release menu' : 'Collapse release menu'}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          className="motion-focus flex h-9 w-9 items-center justify-center rounded-lg text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary"
        >
          <CollapseIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
