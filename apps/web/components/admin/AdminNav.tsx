'use client';

import { useEffect, useRef, useState } from 'react';
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
} from '@/components/icons';
import { ADMIN_MORE_SECTIONS, ADMIN_PRIMARY_NAV, activeNavKey } from '@/lib/admin-sections';

// The admin hub's left menu — one place linking every internal dashboard
// (founder request, 2026-07-30). Visual pattern inherited from the former
// ReleaseSideNav: vertical sticky sidebar on lg+, flattening to a horizontal
// pill row above the content below lg. No feature flags here: every entry is
// an internal surface, and access is enforced server-side by ADMIN_EMAILS on
// each page's backing API (this menu is navigation, not the guard).
//
// Slimmed 2026-10-18 (URG-369, founder approved the mock): six rows, Overview,
// Scoreboard, Metrics, Teams, Emails, More. The order and the More list live in
// lib/admin-sections.ts (tested there); this file only adds the icons. Every
// other dashboard sits behind More, which carries their count, and a page
// behind More lights the More row. Rows are words only, as in the mock; the
// icons stay on ADMIN_NAV_ITEMS for the Settings admin list.

const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  scoreboard: Gauge,
  metrics: Activity,
  teams: Building2,
  emails: Mail,
  more: MoreHorizontal,
};

/** Icons for every dashboard, for the menu and the More page. */
export const ADMIN_SECTION_ICONS: Record<string, typeof LayoutDashboard> = {
  ...NAV_ICONS,
  onboarding: ClipboardList,
  nps: ThumbsUp,
  'profile-funnel': Share2,
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

/** Edge fade for the phone strip: which sides still have tabs past them. */
export function stripFade(start: boolean, end: boolean): string | undefined {
  if (!start && !end) return undefined;
  const from = start ? 'transparent 0, #000 2rem' : '#000 0';
  const to = end ? '#000 calc(100% - 2rem), transparent 100%' : '#000 100%';
  return `linear-gradient(to right, ${from}, ${to})`;
}

export function AdminNav() {
  const pathname = usePathname() || '';
  const activeKey = activeNavKey(pathname);

  // Phone (URG-370, founder's iPhone screenshot, 2026-10-18): below lg the
  // six tabs are a horizontal strip wider than the screen, so on More (or
  // Emails) the lit tab sat off the right edge and no tab looked active.
  // Scroll the active tab into view whenever the page changes, and fade the
  // edge that still has tabs past it so the strip reads as scrollable. On lg+
  // the list is a column, never overflows, and neither effect does anything.
  const stripRef = useRef<HTMLUListElement>(null);
  const [fade, setFade] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const measure = () => {
      const overflow = strip.scrollWidth - strip.clientWidth;
      const next = { start: overflow > 1 && strip.scrollLeft > 1, end: overflow > 1 && strip.scrollLeft < overflow - 1 };
      setFade((current) => (current.start === next.start && current.end === next.end ? current : next));
    };
    measure();
    strip.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      strip.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const tab = strip.querySelector<HTMLElement>('[aria-current="page"]');
    if (!tab) return;
    const stripBox = strip.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    // Only this strip moves: scrollIntoView would also scroll the page.
    const gutter = 32;
    if (tabBox.left < stripBox.left + gutter) {
      strip.scrollLeft += tabBox.left - stripBox.left - gutter;
    } else if (tabBox.right > stripBox.right - gutter) {
      strip.scrollLeft += tabBox.right - stripBox.right + gutter;
    }
  }, [activeKey]);

  const mask = stripFade(fade.start, fade.end);

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
        <span className="whitespace-nowrap lg:hidden">Catalog</span>
        <span className="hidden whitespace-nowrap lg:inline">Back to catalog</span>
      </Link>
      <p className="hidden font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary lg:block lg:px-3 lg:pb-3">
        Admin
      </p>
      <ul
        ref={stripRef}
        className="flex w-full gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      >
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = activeKey === item.key;
          return (
            <li key={item.key} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`motion-focus flex h-9 items-center gap-2.5 rounded-full px-4 text-sm transition-colors lg:rounded-lg lg:px-3 ${
                  active
                    ? 'bg-brand/10 font-medium text-brand'
                    : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                }`}
              >
                <span className="whitespace-nowrap">{item.label}</span>
                {item.key === 'more' ? (
                  <span className="ml-auto hidden pl-2 font-mono text-[11px] tabular-nums text-content-tertiary lg:inline">
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
