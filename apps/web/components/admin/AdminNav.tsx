'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BadgeDollarSign,
  BellRing,
  ClipboardList,
  LayoutDashboard,
  ListMusic,
  Mic,
  Radio,
  TrendingUp,
  Users,
  Building2,
} from 'lucide-react';

// The admin hub's left menu — one place linking every internal dashboard
// (founder request, 2026-07-30). Visual pattern inherited from the former
// ReleaseSideNav (deleted URG-200 — the release pages navigate via header
// links + a back link now; the admin hub keeps a menu because it has six
// unrelated sections and no equivalent hub header to hang them off):
// vertical sticky sidebar on lg+, flattening to a horizontal pill row above
// the content below lg. No feature flags here: every entry is an internal
// surface, and access is enforced server-side by ADMIN_EMAILS on each
// page's backing API (this menu is navigation, not the guard).
const ITEMS: Array<{
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
  exact?: boolean;
}> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, href: '/admin', exact: true },
  { key: 'onboarding', label: 'Onboarding', icon: ClipboardList, href: '/admin/onboarding' },
  { key: 'broadcast', label: 'Broadcast', icon: Radio, href: '/admin/broadcast' },
  { key: 'notifications', label: 'Notifications', icon: BellRing, href: '/admin/notifications' },
  {
    key: 'pricing-validation',
    label: 'Pricing validation',
    icon: BadgeDollarSign,
    href: '/admin/pricing-validation',
  },
  {
    key: 'curator-invites',
    label: 'Playlist owners',
    icon: ListMusic,
    href: '/admin/curator-invites',
  },
  { key: 'teams', label: 'Teams', icon: Building2, href: '/admin/teams' },
  { key: 'waitlist', label: 'Waitlist', icon: Users, href: '/admin/waitlist' },
  { key: 'growth', label: 'Growth', icon: TrendingUp, href: '/admin/growth' },
  { key: 'interviews', label: 'Interviews', icon: Mic, href: '/admin/interviews' },
];

export function AdminNav() {
  const pathname = usePathname() || '';

  return (
    <nav
      aria-label="Admin menu"
      className="flex shrink-0 lg:sticky lg:top-8 lg:h-fit lg:w-52 lg:flex-col"
    >
      <p className="hidden font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary lg:block lg:px-3 lg:pb-3">
        Admin
      </p>
      <ul className="flex w-full gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.key} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`motion-focus flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors ${
                  active
                    ? 'bg-brand/10 font-medium text-brand'
                    : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
