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
  Send,
  Wallet2,
  X,
  type LucideProps,
} from '@/components/icons';
import { UserCircle2 } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { useSettingsLinkClick } from '@/components/settings/useOpenSettings';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { primeKeyboard } from '@/lib/keyboard-handoff';
import { settingsDeepLink } from '@/lib/settings-nav';
import {
  activeMobileTab,
  buildMobileTabs,
  buildMoreItems,
  buildShellAreas,
  readShellFlags,
} from '@/lib/shell-nav';
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
  pitching: Send,
};

/**
 * The phone's bottom bar: Home, Catalogue, UrgAns, Pitching and More. Thumb
 * reachable, and the same destinations as the desktop pills, because both read
 * lib/shell-nav.ts.
 *
 * More opens a sheet with the areas the bar does not carry (Relationships,
 * Opportunities, Audience; Shows is a tab inside Relationships) plus credits
 * and settings. Areas with nothing built
 * yet are listed like any other, and their page explains what is coming.
 *
 * Labels stay visible. Icon-only tabs were tried here before (v1.10.3) and cost
 * the people who most need the bar the words that tell them what each tab does.
 */
export function BottomBar() {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useMemo(() => buildShellAreas(readShellFlags()), []);
  const tabs = useMemo(() => buildMobileTabs(), []);
  const active = activeMobileTab(areas, pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const collapsed = useBarCollapsedOnScroll(pathname);
  const tip = useNavTip();
  const ActiveIcon = active === 'more' ? MoreHorizontal : (TAB_ICON[active ?? ''] ?? Home);

  return (
    <>
      {/* A floating glass pill that shrinks to one round button at the left when
          the page scrolls down and opens again on scroll up or a tap. The fixed
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
              <MoreHorizontal className="pointer-events-none h-[18px] w-[18px]" aria-hidden="true" />
              More
            </button>
          </li>
        </ul>
      </nav>
      {tip.panel}
      {moreOpen ? <MoreSheet areas={areas} onClose={() => setMoreOpen(false)} /> : null}
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
 * True while the person is scrolling down the page. Any scroll container counts
 * (the capture listener hears panels as well as the window), small movements are
 * ignored so a wobble does not flicker the bar, and the bar is always open at
 * the very top of a page.
 */
function useBarCollapsedOnScroll(pathname: string): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const held = barNeverCollapsesOn(pathname);
  useEffect(() => {
    if (held) return;
    const lastTop = new WeakMap<EventTarget, number>();
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
      const previous = lastTop.get(key) ?? 0;
      const next = nextBarCollapsed({
        top: el.scrollTop,
        previous,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      });
      if (next === null) return;
      setCollapsed(next);
      lastTop.set(key, el.scrollTop);
    };
    const expand = () => setCollapsed(false);
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener(EXPAND_EVENT, expand);
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener(EXPAND_EVENT, expand);
    };
  }, [held]);
  // Held pages report open without touching state, so leaving one starts fresh.
  return held ? false : collapsed;
}

function MoreSheet({
  areas,
  onClose,
}: {
  areas: ReturnType<typeof buildShellAreas>;
  onClose: () => void;
}) {
  const openSettings = useSettingsLinkClick();
  const tip = useNavTip({ overSheet: true });
  const items = buildMoreItems(areas);
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
        className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-stroke-default bg-bg-surface px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stroke-strong" aria-hidden="true" />
        <div className="flex items-center justify-between pb-2">
          <h2 className="font-display text-xl font-semibold text-content-primary">More</h2>
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
        </ul>
        {tip.panel}
      </DialogPanel>
    </div>,
    document.body
  );
}
