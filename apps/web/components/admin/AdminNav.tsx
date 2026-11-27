'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  Activity,
  Bug,
  BellRing,
  ChevronLeft,
  ClipboardList,
  ExternalLink,
  Gauge,
  Inbox,
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
import {
  ADMIN_DESKTOP_MENU,
  ADMIN_PRIMARY_NAV,
  activeDesktopKey,
  activeNavKey,
  adminBackTarget,
  adminDesktopBackTarget,
  waitingCount,
  type AdminWaitingKey,
} from '@/lib/admin-sections';
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
  'source-links': ExternalLink,
  billing: Wallet2,
  notifications: BellRing,
  'curator-invites': ListMusic,
  'curator-applications': Inbox,
  'pitch-payments': PiggyBank,
  referrals: Link2,
  'issue-reports': Bug,
  urgans: Sparkles,
  directory: UserPlus,
  claims: UserPlus,
  'artist-verification': UserPlus,
  seeding: Send,
  featured: Spotlight,
  'promo-channels': Megaphone,
  'self-serve': Wallet2,
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

/** How often the menu's red counts reload while you move around the admin. */
const ATTENTION_REFRESH_MS = 60 * 1000;

/**
 * The red counts on the desktop menu: GET /api/admin/attention, the same
 * head-only counts the Overview reads. Read on first show and again when you
 * change page, at most once a minute. A failed read shows no counts, never 0.
 */
function useAttentionCounts(pathname: string) {
  const [counts, setCounts] = useState<Partial<Record<AdminWaitingKey, number | null>> | null>(null);
  const loadedAt = useRef(0);

  useEffect(() => {
    if (loadedAt.current && Date.now() - loadedAt.current < ATTENTION_REFRESH_MS) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch('/api/admin/attention', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const body = (await response.json().catch(() => ({}))) as {
          attention?: Partial<Record<AdminWaitingKey, number | null>>;
        };
        if (!cancelled && body.attention) {
          setCounts(body.attention);
          loadedAt.current = Date.now();
        }
      } catch {
        // No counts is fine: the pages themselves still show what waits.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return counts;
}

/**
 * Desktop (lg+) sidebar (2026-11-12, #1241; founder approved the mock): every
 * admin page in four groups, Every day first, with a red count on what waits.
 * Below lg it renders nothing; AdminBottomBar takes over.
 */
export function AdminNav() {
  const pathname = usePathname() || '';
  const activeKey = activeDesktopKey(pathname);
  const counts = useAttentionCounts(pathname);

  return (
    <nav aria-label="Admin menu" className="hidden shrink-0 flex-col lg:sticky lg:top-8 lg:flex lg:h-fit lg:w-56">
      {/*
        The way out. /admin/* renders no app chrome at all, so without this
        link the only exits are the browser Back button and typing a URL. On
        phone the same exit is the last row on More.
      */}
      <Link
        href="/dashboard"
        className="motion-focus mb-2 flex h-9 w-fit items-center gap-2 rounded-lg px-3 text-sm text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">Back to the app</span>
      </Link>
      {ADMIN_DESKTOP_MENU.map((group) => (
        <div key={group.key} className="mt-3">
          <h2 className="px-3 pb-1 text-xs font-semibold text-content-tertiary">{group.label}</h2>
          <ul className="flex w-full flex-col gap-0.5">
            {group.items.map((item) => {
              const active = activeKey === item.key;
              const count = waitingCount(item, counts);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'motion-focus flex h-8 items-center gap-2 rounded-lg px-3 text-sm transition-colors',
                      active
                        ? 'bg-bg-hover font-semibold text-content-primary'
                        : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {count !== null ? (
                      <span className="rounded-full bg-status-error px-1.5 text-[11px] font-bold leading-[17px] tabular-nums text-white">
                        <span className="sr-only">, </span>
                        {count}
                        <span className="sr-only"> waiting</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
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

/**
 * The back button of a page below a tab: a ghost button with the parent's
 * name. On a computer the menu already lists every page, so it shows only on
 * a page the menu does not list (Write an email, Onboarding emails).
 */
export function AdminBackButton() {
  const pathname = usePathname() || '';
  const phone = adminBackTarget(pathname);
  const desktop = adminDesktopBackTarget(pathname);
  const link = (target: { label: string; href: string }, className: string) => (
    <Link
      href={target.href}
      className={buttonVariants({
        variant: 'ghost',
        size: 'sm',
        className: cn('-ml-3 mb-3 gap-1 text-sm font-normal', className),
      })}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {target.label}
    </Link>
  );
  return (
    <>
      {phone ? link(phone, 'lg:hidden') : null}
      {desktop ? link(desktop, 'hidden lg:inline-flex') : null}
    </>
  );
}
