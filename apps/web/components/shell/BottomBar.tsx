'use client';

import { barNeverCollapsesOn, nextBarCollapsed } from '@/lib/bar-collapse';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  Disc3,
  Handshake,
  Headphones,
  Home,
  MoreHorizontal,
  Spotlight,
  Sparkles,
  Wallet2,
  X,
  type LucideProps,
} from '@/components/icons';
import { Bell, Check, Gauge, Search, UserCircle2, Users } from '@/components/icons';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { hasPullReveal, revealListSearch } from '@/components/shared/PullReveal';
import { useShellStore } from '@/stores/useShellStore';
import { useNotificationsDoorStore } from '@/stores/useNotificationsDoorStore';
import { ProfileFace } from '@/components/shared/ProfileFace';
import { useArtistFilterOptions } from './useArtistFilter';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { useSettingsLinkClick } from '@/components/settings/useOpenSettings';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { primeKeyboard } from '@/lib/keyboard-handoff';
import { settingsDeepLink } from '@/lib/settings-nav';
import {
  activeMobileTab,
  buildMobileTabs,
  buildMoreItems,
  type ShellArea,
} from '@/lib/shell-nav';
import { tuckedMoreItems } from '@/lib/role-views';
import { useShellAreas } from './useShellAreas';
import { useHelpMenuGroups } from '@/components/app/HelpMenu';
import { NAV_TIP_TOUCH_CLASS, useNavTip } from './useNavTip';

type IconComponent = ComponentType<LucideProps>;

/** The areas in the More sheet. Each carries a piece of the music trade. */
const MORE_ICON: Record<string, IconComponent> = {
  relationships: Handshake,
  opportunities: Spotlight,
  audience: Headphones,
};

const TAB_ICON: Record<string, IconComponent> = {
  home: Home,
  catalogue: Disc3,
  urgans: Sparkles,
};

/**
 * The phone's bottom bar: Home, Catalogue, UrgAns and More (Pitching left it
 * on 2026-10-15 and lives inside each rollout). Thumb
 * reachable, and the same destinations as the desktop pills, because both read
 * lib/shell-nav.ts.
 *
 * More opens a sheet with the areas the bar does not carry (Relationships,
 * Opportunities, Audience; Shows is a tab inside Relationships) plus credits
 * and settings. Since 2026-10-11 it also carries what the phone's top bar no
 * longer does (founder call: the bar is the search button alone): the artist
 * filter ("Showing"), Notifications (the bell's "live" panel, with its unread
 * count, also shown as a dot on More) and Settings for the account. Later that
 * day the phone's top bar went altogether (founder call: it looked bad), so
 * More's first row is Search now: the same action the bar's search button had
 * (the page's folded list search where there is one, the search bar otherwise).
 * Areas with nothing built
 * yet are listed like any other, and their page explains what is coming.
 *
 * Since 2026-10-14 the sheet ends with the same help rows as the desktop
 * account menu (Report an issue, Docs, Contact us, Community, and the rollout
 * replay when there is one), read from the one list in HelpMenu.tsx and behind
 * the same showHelpMenu gate AppShell hands WorkspaceMenu.
 *
 * Labels stay visible. Icon-only tabs were tried here before (v1.10.3) and cost
 * the people who most need the bar the words that tell them what each tab does.
 */
export function BottomBar({ showHelp = false }: { showHelp?: boolean }) {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const tabs = useMemo(() => buildMobileTabs(), []);
  const active = activeMobileTab(areas, pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const collapsed = useBarCollapsedOnScroll(pathname);
  const tip = useNavTip();
  const ActiveIcon = active === 'more' ? MoreHorizontal : (TAB_ICON[active ?? ''] ?? Home);
  const unread = useNotificationsDoorStore((state) => (state.available ? state.unread : 0));

  return (
    <>
      {/* A floating glass pill that shrinks to one round button at the left when
          the page scrolls down and opens again only at the top of the page or
          on a tap of that button. The fixed
          4rem strip below it is still reserved by .mobile-nav-clearance, so
          nothing is hidden behind it at the end of a page. */}
      <nav
        aria-label="Primary"
        data-collapsed={collapsed ? 'true' : 'false'}
        className="mobile-nav-bar fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 z-40 h-14 overflow-hidden rounded-full border border-stroke-default bg-bg-surface/70 shadow-lg backdrop-blur-2xl transition-[width] duration-300 ease-standard lg:hidden"
        style={{ width: collapsed ? '3.5rem' : 'calc(100vw - 1.5rem)' }}
      >
        <button
          type="button"
          aria-label="Open navigation"
          tabIndex={collapsed ? 0 : -1}
          aria-hidden={!collapsed}
          onClick={() => expandBottomBar()}
          className={`motion-focus absolute left-0 top-0 grid h-14 w-14 place-items-center text-brand transition-opacity duration-200 ${
            collapsed ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <ActiveIcon className="pointer-events-none h-5 w-5" aria-hidden="true" />
        </button>
        <ul
          className={`mx-auto flex h-14 w-[calc(100vw-1.5rem)] max-w-xl items-stretch gap-0.5 px-1.5 py-1 transition-opacity duration-200 ${
            collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          aria-hidden={collapsed}
        >
          {tabs.map((tab) => {
            const Icon = TAB_ICON[tab.key] ?? Home;
            const isActive = active === tab.key;
            return (
              <li key={tab.key} className="flex-1">
                <Link
                  href={tab.href}
                  tabIndex={collapsed ? -1 : 0}
                  {...tip.bind(tab.key)}
                  onClick={
                    tab.key === 'catalogue'
                      ? leaveReleaseForCatalog
                      : tab.key === 'urgans' && !isActive
                        ? primeKeyboard
                        : undefined
                  }
                  aria-current={isActive ? 'page' : undefined}
                  data-tour={tab.key === 'catalogue' ? 'nav-catalog' : tab.key === 'urgans' ? 'nav-urgans' : `shell-mobile-${tab.key}`}
                  className={`motion-focus flex h-full flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-colors ${NAV_TIP_TOUCH_CLASS} ${
                    isActive ? 'bg-bg-hover text-brand' : 'text-content-tertiary'
                  }`}
                >
                  <Icon className="pointer-events-none h-[18px] w-[18px]" aria-hidden="true" />
                  {tab.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              tabIndex={collapsed ? -1 : 0}
              {...tip.bind('more')}
              onClick={() => setMoreOpen(true)}
              data-shell-more
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`motion-focus flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-colors ${NAV_TIP_TOUCH_CLASS} ${
                active === 'more' ? 'bg-bg-hover text-brand' : 'text-content-tertiary'
              }`}
            >
              {/* pointer-events-none on the icon (2026-10-11): a first-session
                  replay recorded a "dead" tap here whose target was one of the
                  ellipsis's three 1px circles, not the button. The button
                  always handled it; this just makes the whole 56px cell the
                  target, so taps and their analytics land on the button. */}
              <span className="pointer-events-none relative">
                <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
                {unread > 0 ? (
                  <span aria-hidden="true" className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-brand" />
                ) : null}
              </span>
              More
              {unread > 0 ? <span className="sr-only">, unread notifications</span> : null}
            </button>
          </li>
        </ul>
      </nav>
      {tip.panel}
      {moreOpen ? <MoreSheet areas={areas} showHelp={showHelp} onClose={() => setMoreOpen(false)} /> : null}
    </>
  );
}

// Shared so the collapsed button can open the bar again without the hook
// owning a second copy of the state.
const EXPAND_EVENT = 'urganize:bottom-bar-expand';
function expandBottomBar() {
  window.dispatchEvent(new Event(EXPAND_EVENT));
}

/**
 * True once the person has scrolled down the page, until they are back at the
 * very top or tap the round button (2026-10-17, founder call; scrolling up
 * partway no longer opens it). Any scroll container counts (the capture
 * listener hears panels as well as the window), small movements are ignored so
 * a wobble does not flicker the bar, and a new page starts with the bar open.
 */
function useBarCollapsedOnScroll(pathname: string): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    // A new page is read from its top, so it opens with the bar open.
    setSeenPath(pathname);
    setCollapsed(false);
  }
  const held = barNeverCollapsesOn(pathname);
  useEffect(() => {
    if (held) return;
    // The offset each scroller had when the bar last reacted. Emptied when the
    // round button is tapped, so the next scroll only takes a fresh reading
    // instead of measuring from a spot the person has since scrolled back from.
    let lastTop = new WeakMap<EventTarget, number>();
    const onScroll = (event: Event) => {
      const target = event.target;
      const el =
        target instanceof Document || target === window
          ? (document.scrollingElement ?? document.documentElement)
          : target instanceof HTMLElement
            ? target
            : null;
      if (!el) return;
      const key = (target ?? window) as EventTarget;
      const previous = lastTop.get(key);
      if (previous === undefined) {
        // The first scroll a scroller makes (or the first after a tap) only
        // takes the reading the next one is measured from.
        lastTop.set(key, el.scrollTop);
        return;
      }
      const next = nextBarCollapsed({
        top: el.scrollTop,
        previous,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      });
      // A scroll back up moves the reading with it (the bar stays folded), so
      // the next scroll down is measured from where the person turned round.
      if (next !== null || el.scrollTop < previous) lastTop.set(key, el.scrollTop);
      if (next === null) return;
      setCollapsed(next);
    };
    const expand = () => {
      lastTop = new WeakMap<EventTarget, number>();
      setCollapsed(false);
    };
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener(EXPAND_EVENT, expand);
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener(EXPAND_EVENT, expand);
    };
  }, [held, pathname]);
  // Held pages report open without touching state, so leaving one starts fresh.
  const folded = held ? false : collapsed;
  // Published on <html> so the page's own floating controls (the rollout's
  // "Rollout menu" pill, Home's UrgAns box) can drop into the space the bar
  // frees and rise again when it opens. The rules live in globals.css.
  useEffect(() => {
    const root = document.documentElement;
    if (folded) root.dataset.bottomBar = 'collapsed';
    else delete root.dataset.bottomBar;
    return () => {
      delete root.dataset.bottomBar;
    };
  }, [folded]);
  return folded;
}

function MoreSheet({
  areas,
  showHelp,
  onClose,
}: {
  areas: ShellArea[];
  showHelp: boolean;
  onClose: () => void;
}) {
  const isAdmin = useWorkspaceIdentityStore((state) => state.isAdmin);
  const openSettings = useSettingsLinkClick();
  const tip = useNavTip({ overSheet: true });
  // What the role view tucked (URG-260) follows the areas the bar does not
  // carry; empty when nothing is tucked.
  const items = [...buildMoreItems(areas), ...tuckedMoreItems(areas)];
  const notifications = useNotificationsDoorStore();
  const openCommand = useShellStore((state) => state.openCommand);
  const { options: artistOptions, select: selectArtist } = useArtistFilterOptions();
  // The desktop account menu's help rows, from the same list and gate.
  const helpGroups = useHelpMenuGroups();
  const helpItems = showHelp ? helpGroups.flat() : [];
  if (typeof document === 'undefined') return null;

  // Portalled: AppShell's fade-in transform would otherwise anchor this fixed
  // sheet to the shell instead of the screen.
  return createPortal(
    <div className="fixed inset-0 z-[170] lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <DialogPanel
        label="More"
        onClose={onClose}
        className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-env(safe-area-inset-top,0px)-1rem)] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-stroke-default bg-bg-surface px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-stroke-strong" aria-hidden="true" />
        <div className="flex items-center justify-between pb-2">
          {/* The phone's Beta label (2026-10-15, URG-311): there is no phone top
              bar to carry the desktop's pill beside the mark, so it sits here. */}
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-content-primary">
            More
            <span className="select-none rounded-full bg-brand/15 px-1.5 py-px font-sans text-[10px] font-bold uppercase tracking-wide text-brand">
              Beta
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="motion-focus grid h-11 w-11 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <ul className="divide-y divide-stroke-subtle">
          {/* Search first: the phone has no top bar since 2026-10-11, and this
              is where its search button went. Same action as the desktop
              button: a page with a folded list search (PullReveal) opens and
              focuses that, every other page opens the search bar. The sheet
              closes first so the field it opens is the one left focused. */}
          <li>
            <button
              type="button"
              data-tour="shell-mobile-search"
              onClick={() => {
                onClose();
                if (hasPullReveal()) revealListSearch();
                else openCommand();
              }}
              className="motion-focus flex min-h-14 w-full items-center gap-2.5 text-left text-base text-content-primary"
            >
              <Search className="h-5 w-5 text-content-tertiary" aria-hidden="true" />
              Search
            </button>
          </li>
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                {...tip.bind(item.key)}
                onClick={onClose}
                className={`motion-focus flex min-h-14 items-center gap-2.5 text-base text-content-primary ${NAV_TIP_TOUCH_CLASS}`}
              >
                {(() => {
                  const Icon = MORE_ICON[item.key];
                  return Icon ? <Icon className="h-5 w-5 text-content-tertiary" aria-hidden="true" /> : null;
                })()}
                {item.label}
              </Link>
            </li>
          ))}
          {notifications.available ? (
            <li>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  notifications.requestOpen();
                }}
                className="motion-focus flex min-h-14 w-full items-center gap-2.5 text-left text-base text-content-primary"
              >
                {/* The same plain bell as the computer's top bar (URG-255). */}
                <Bell className="h-5 w-5 text-content-tertiary" aria-hidden="true" />
                Notifications
                {notifications.unread > 0 ? (
                  <span className="ml-auto grid min-h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-semibold text-content-inverse">
                    {notifications.unread > 9 ? '9+' : notifications.unread}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </button>
            </li>
          ) : null}
          <li>
            <Link
              href="/dashboard/credits"
              onClick={onClose}
              className="motion-focus flex min-h-14 items-center gap-2.5 text-base text-content-primary"
            >
              <Wallet2 className="h-5 w-5 text-content-tertiary" aria-hidden="true" />
              Credits
            </Link>
          </li>
          <li>
            <Link
              href={settingsDeepLink()}
              onClick={(event) => {
                openSettings(event);
                onClose();
              }}
              className="motion-focus flex min-h-14 items-center gap-2.5 text-base text-content-primary"
            >
              <UserCircle2 className="h-5 w-5 text-content-tertiary" aria-hidden="true" />
              Settings
            </Link>
          </li>
          {/* Admin (2026-10-15, founder call, URG-313): the internal dashboards
              straight from More on a phone, for the accounts ADMIN_EMAILS
              names. Settings > Admin still lists them too. */}
          {isAdmin ? (
            <li>
              <Link
                href="/admin"
                onClick={onClose}
                className="motion-focus flex min-h-14 items-center gap-2.5 text-base text-content-primary"
              >
                <Gauge className="h-5 w-5 text-content-tertiary" aria-hidden="true" />
                Admin
              </Link>
            </li>
          ) : null}
        </ul>
        {helpItems.length > 0 ? (
          <div role="group" aria-label="Help" className="border-t border-stroke-subtle">
            <ul className="divide-y divide-stroke-subtle">
              {helpItems.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => {
                      // The sheet closes first so whatever the row opens (the
                      // report form, a new tab) is not under it.
                      onClose();
                      item.onClick();
                    }}
                    className="motion-focus flex min-h-14 w-full items-center gap-2.5 text-left text-base text-content-primary [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-content-tertiary"
                  >
                    {item.icon}
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {artistOptions.length > 0 ? (
          <div role="group" aria-label="Showing" className="mt-2 border-t border-stroke-subtle pt-3">
            <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">Showing</p>
            <ul>
              {artistOptions.map((artist) => (
                <li key={artist.id ?? 'all'}>
                  <button
                    type="button"
                    aria-pressed={artist.active}
                    onClick={() => {
                      selectArtist(artist.id);
                      onClose();
                    }}
                    className="motion-focus flex min-h-12 w-full items-center justify-between gap-2 text-left text-base text-content-primary"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      {artist.id ? (
                        <ProfileFace name={artist.name} photoUrl={artist.photoUrl} size={32} />
                      ) : (
                        <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full border border-stroke-default text-content-tertiary" style={{ width: 32, height: 32 }}>
                          <Users className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <span className="truncate">{artist.name}</span>
                    </span>
                    {artist.active ? <Check className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {tip.panel}
      </DialogPanel>
    </div>,
    document.body
  );
}
