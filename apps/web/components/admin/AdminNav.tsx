'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Bug,
  BellRing,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  ListMusic,
  Mail,
  Mic,
  PiggyBank,
  Smile,
  Sparkles,
  TrendingUp,
  Users,
  UserPlus,
  Building2,
  Link2,
} from '@/components/icons';

// The admin hub's left menu — one place linking every internal dashboard
// (founder request, 2026-07-30). Visual pattern inherited from the former
// ReleaseSideNav (deleted URG-200 — the release pages navigate via header
// links + a back link now; the admin hub keeps a menu because it has six
// unrelated sections and no equivalent hub header to hang them off):
// vertical sticky sidebar on lg+, flattening to a horizontal pill row above
// the content below lg. No feature flags here: every entry is an internal
// surface, and access is enforced server-side by ADMIN_EMAILS on each
// page's backing API (this menu is navigation, not the guard).
export const ADMIN_NAV_ITEMS: Array<{
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
  exact?: boolean;
}> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, href: '/admin', exact: true },
  // Second, under Overview: the strategy doc's numbers, which the Monday review
  // starts with (docs/strategy/company-strategy.md, section 2).
  { key: 'scoreboard', label: 'Scoreboard', icon: Gauge, href: '/admin/scoreboard' },
  // Third: who is using Urganize right now and how (2026-10-07).
  { key: 'metrics', label: 'Metrics', icon: Activity, href: '/admin/metrics' },
  { key: 'onboarding', label: 'Onboarding', icon: ClipboardList, href: '/admin/onboarding' },
  { key: 'emails', label: 'Emails', icon: Mail, href: '/admin/emails' },
  { key: 'notifications', label: 'Notifications', icon: BellRing, href: '/admin/notifications' },
  {
    key: 'curator-invites',
    label: 'Playlist owners',
    icon: ListMusic,
    href: '/admin/curator-invites',
  },
  {
    key: 'pitch-payments',
    label: 'Pitch payments',
    icon: PiggyBank,
    href: '/admin/pitch-payments',
  },
  { key: 'teams', label: 'Teams', icon: Building2, href: '/admin/teams' },
  { key: 'referrals', label: 'Referrals', icon: Link2, href: '/admin/referrals' },
  { key: 'issue-reports', label: 'Reports', icon: Bug, href: '/admin/issue-reports' },
  { key: 'urgans', label: 'UrgAns actions', icon: Sparkles, href: '/admin/urgans' },
  { key: 'directory', label: 'Directory', icon: UserPlus, href: '/admin/directory' },
  { key: 'waitlist', label: 'Waitlist', icon: Users, href: '/admin/waitlist' },
  { key: 'growth', label: 'Growth', icon: TrendingUp, href: '/admin/growth' },
  { key: 'interviews', label: 'Interviews', icon: Mic, href: '/admin/interviews' },
  // The mascot's model sheet, rendered from the shared component. Reads no
  // data, so unlike its neighbours it has no backing API acting as the guard.
  { key: 'chappi', label: 'Chappi', icon: Smile, href: '/admin/chappi' },
];

export function AdminNav() {
  const pathname = usePathname() || '';

  return (
    <nav
      aria-label="Admin menu"
      className="flex shrink-0 flex-col lg:sticky lg:top-8 lg:h-fit lg:w-52"
    >
      {/*
        The way out. /admin/* renders no app chrome at all — AppShell's
        showWorkspaceChrome covers only /dashboard and /settings — so there is
        no topbar and no identity card here, and until this link existed the
        only exits were the browser Back button and typing a URL. The hub's
        own per-page "Back" buttons were removed on 2026-07-30 when this menu
        replaced them, and nothing took over that job; this is it.

        It sits ABOVE the item list rather than inside it because it leaves the
        section rather than picking one, and because the list scrolls
        horizontally below lg — an exit that can scroll off the side of a phone
        is not an exit. It is never active, so it carries no aria-current.

        Labelled "catalog" to match the identity card's own name for
        /dashboard, so the two navs agree on what that surface is called.
        /dashboard is hardcoded here, as it is there: HOME_PATH is the
        post-authentication LANDING decision, and this is an ordinary nav href.
      */}
      <Link
        href="/dashboard"
        className="motion-focus mb-3 flex h-9 w-fit items-center gap-2.5 rounded-lg px-3 text-sm text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary lg:mb-4"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">Back to catalog</span>
      </Link>
      <p className="hidden font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary lg:block lg:px-3 lg:pb-3">
        Admin
      </p>
      <ul className="flex w-full gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {ADMIN_NAV_ITEMS.map((item) => {
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
