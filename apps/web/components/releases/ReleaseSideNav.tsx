'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
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
// destination is. Overview is always present; the nav renders null with
// fewer than two visible items (a one-item menu is dead chrome).
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

  if (items.length < 2) return null;

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
          return (
            <li key={item.key} className="shrink-0 lg:shrink">
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
          collapse. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-pressed={collapsed}
        aria-label={collapsed ? 'Expand release menu' : 'Collapse release menu'}
        title={collapsed ? 'Expand' : 'Collapse'}
        className={`motion-focus mt-2 hidden h-9 items-center gap-2.5 rounded-lg text-sm text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary lg:flex ${
          collapsed ? 'lg:w-9 lg:justify-center lg:px-0' : 'px-3'
        }`}
      >
        <CollapseIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className={`whitespace-nowrap ${collapsed ? 'lg:hidden' : ''}`}>Collapse</span>
      </button>
    </nav>
  );
}
