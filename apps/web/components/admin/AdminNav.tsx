'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Bug,
  BellRing,
  ChevronLeft,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  LayoutGrid,
  ListMusic,
  Mail,
  Megaphone,
  Mic,
  PiggyBank,
  Send,
  Share2,
  Smile,
  Sparkles,
  ThumbsUp,
  Users,
  UserPlus,
  Building2,
  Link2,
  Spotlight,
  MoreHorizontal,
  Wallet2,
} from '@/components/icons';
import { ADMIN_MORE_SECTIONS, ADMIN_PRIMARY_NAV, activeNavKey, adminBackTarget } from '@/lib/admin-sections';
import { buttonVariants, cn } from '@/components/admin/ui';

// The admin hub's menu: one place linking every internal dashboard (founder
// request, 2026-07-30). No feature flags here: every entry is an internal
// surface, and access is enforced server-side by ADMIN_EMAILS on each page's
// backing API (this menu is navigation, not the guard).
//
// Since 2026-10-18 (founder approved the mock: "Sure", desktop included) the
// menu is four tabs, Overview, Teams, Emails, More, read from one list
// (ADMIN_PRIMARY_NAV in lib/admin-sections.ts, tested there):
//  - Phone (below lg): AdminBottomBar, a floating glass pill with icon and
//    label, the same pattern as the catalog's BottomBar. It replaced the top
//    strip of six pills that never fitted 390px (and its scroll-into-view and
//    edge-fade code from URG-370). The way back to the catalog is the last row
//    on More.
//  - Desktop (lg+): AdminNav, the sticky sidebar, the same four rows with the
//    More count, and "Back to catalog" above them.
// A page below a tab lights that tab, and AdminBackButton names it.

const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  overview: LayoutGrid,
  teams: Building2,
  emails: Mail,
  more: MoreHorizontal,
};

/** Icons for every dashboard, for the menu and the More page. */
export const ADMIN_SECTION_ICONS: Record<string, typeof LayoutDashboard> = {
  ...NAV_ICONS,
  scoreboard: Gauge,
  metrics: Activity,
  onboarding: ClipboardList,
  nps: ThumbsUp,
  'profile-funnel': Share2,
  billing: Wallet2,
  notifications: BellRing,
  'curator-invites': ListMusic,
  'pitch-payments': PiggyBank,
  referrals: Link2,
  'issue-reports': Bug,
  urgans: Sparkles,
  directory: UserPlus,
  claims: UserPlus,
  seeding: Send,
  featured: Spotlight,
  'promo-channels': Megaphone,
  waitlist: Users,
  interviews: Mic,
  chappi: Smile,
};

export const ADMIN_NAV_ITEMS: Array<{
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
  exact?: boolean;
}> = ADMIN_PRIMARY_NAV.map((item) => ({ ...item, icon: NAV_ICONS[item.key] ?? LayoutDashboard }));

/** Desktop (lg+) sidebar. Below lg it renders nothing; AdminBottomBar takes over. */
export function AdminNav() {
  const pathname = usePathname() || '';
  const activeKey = activeNavKey(pathname);

  return (
    <nav aria-label="Admin menu" className="hidden shrink-0 flex-col lg:sticky lg:top-8 lg:flex lg:h-fit lg:w-52">
      {/*
        The way out. /admin/* renders no app chrome at all (AppShell's
        showWorkspaceChrome covers only /dashboard and /settings), so without
        this link the only exits are the browser Back button and typing a URL.
        Labelled "catalog" to match the identity card's own name for
        /dashboard. On phone the same exit is the last row on More.
      */}
      <Link
        href="/dashboard"
        className="motion-focus mb-4 flex h-9 w-fit items-center gap-2.5 rounded-lg px-3 text-sm text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">Back to catalog</span>
      </Link>
      <ul className="flex w-full flex-col gap-1">
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = activeKey === item.key;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'motion-focus flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors',
                  active
                    ? 'bg-brand/10 font-medium text-brand'
                    : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                )}
              >
                <span className="whitespace-nowrap">{item.label}</span>
                {item.key === 'more' ? (
                  <span className="ml-auto pl-2 font-mono text-[11px] tabular-nums text-content-tertiary">
                    {ADMIN_MORE_SECTIONS.length}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Phone (below lg): the four tabs as a bottom bar, icon and label, drawn like
 * the catalog's BottomBar (components/shell/BottomBar.tsx). Static, so it shows
 * at once while a page is still loading.
 */
export function AdminBottomBar() {
  const pathname = usePathname() || '';
  const activeKey = activeNavKey(pathname);

  return (
    <nav
      aria-label="Admin tabs"
      className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 h-14 overflow-hidden rounded-full border border-stroke-default bg-bg-surface/70 shadow-lg backdrop-blur-2xl lg:hidden"
    >
      <ul className="mx-auto flex h-14 max-w-xl items-stretch gap-0.5 px-1.5 py-1">
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeKey === item.key;
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'motion-focus flex h-full flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-colors',
                  active ? 'bg-bg-hover text-brand' : 'text-content-tertiary'
                )}
              >
                <Icon className="pointer-events-none h-[18px] w-[18px]" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The back button of a page below a tab: a ghost button with the parent's name. */
export function AdminBackButton() {
  const pathname = usePathname() || '';
  const target = adminBackTarget(pathname);
  if (!target) return null;
  return (
    <Link
      href={target.href}
      className={buttonVariants({
        variant: 'ghost',
        size: 'sm',
        className: '-ml-3 mb-3 gap-1 text-sm font-normal',
      })}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {target.label}
    </Link>
  );
}
