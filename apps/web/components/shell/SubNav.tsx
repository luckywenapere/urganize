'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from '@/components/icons';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { NAV_TIP_TOUCH_CLASS, useNavTip } from './useNavTip';
import { activeShellArea, visibleSubTabs, type ShellSubTabAction } from '@/lib/shell-nav';
import { useShellStore } from '@/stores/useShellStore';
import { useShellAreas } from './useShellAreas';
import { useRolloutPhoneChrome } from '@/stores/useRolloutPhoneChrome';

/**
 * The row of tabs for the area you are in (Deel's "People, Org chart, Time
 * off..." strip), BELOW `lg` ONLY since URG-254 (2026-10-14): on a computer the
 * top bar carries the tabs on its own line (TopNav.tsx) and this row is gone. It draws
 * nothing when the area has only one tab, because a row with a single choice is
 * just noise.
 *
 * It scrolls sideways instead of wrapping, and the active tab is kept in view
 * so a deep link never lands with its own tab off screen.
 */
/** The slots a page portals its desktop furniture into. They live in the top
 *  bar now (TopNav.tsx), desktop only; the names are kept so pages need no
 *  change. A count or summary ("Total 14 rollouts"). */
export const SUBNAV_SLOT_START = 'subnav-slot-start';
/** The page's primary action (Add rollout). */
export const SUBNAV_SLOT_END = 'subnav-slot-end';
/** A list page's search and filters (ListToolbar), right-aligned before the
 *  primary action (founder mock, 2026-10-11). */
export const SUBNAV_SLOT_TOOLS = 'subnav-slot-tools';
/** The phone tab row's right end. SubNav draws the tab's own action there
 *  (lib/shell-nav.ts `action`) since the tab jump fix, Oct 18, 2026: Add
 *  artist on Artists, New rollout on Rollouts. It is always 36px wide, button
 *  or not, so the row has one shape on every tab. Pages no longer portal
 *  into it. Phones only. */
export const SUBNAV_SLOT_PHONE_END = 'subnav-slot-phone-end';

/** A plain plus. The stamped Plus (components/icons) reads as a crosshair at
 *  16px (Oyin approved the plain one for this button, Oct 18, 2026). Add
 *  artist uses the stamped one at 18px since Oct 31, 2026 (Oyin), matching
 *  the + on the Artists page itself; New rollout keeps the plain one. */
function PlainPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

const ACTION_CLASS =
  'motion-focus motion-press inline-flex h-9 w-9 items-center justify-center rounded-full border border-stroke-strong bg-bg-surface text-content-primary [@media(hover:hover)]:hover:bg-bg-hover';

/** The quiet 36px circle, the same on every tab; only its label changes. */
function TabAction({ action }: { action: ShellSubTabAction | null }) {
  const openCreate = useShellStore((state) => state.openCreate);
  // A page that owns its own create modal (WorkspaceView on Rollouts) claims
  // the press, so exactly one modal opens; otherwise the shell's one does.
  const createHandler = useShellStore((state) => state.createHandler);
  const openAddArtist = useShellStore((state) => state.openAddArtist);
  if (!action) return null;
  if (action.href) {
    return (
      <Link href={action.href} scroll={false} aria-label={action.label} title={action.label} className={ACTION_CLASS}>
        <PlainPlus />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() =>
        action.press === 'addArtist' ? openAddArtist() : createHandler ? createHandler() : openCreate()
      }
      aria-label={action.label}
      title={action.label}
      className={ACTION_CLASS}
    >
      {action.press === 'addArtist' ? <Plus className="h-[18px] w-[18px]" aria-hidden="true" /> : <PlainPlus />}
    </button>
  );
}

export function SubNav() {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useShellAreas();
  const tabs = visibleSubTabs(activeShellArea(areas, pathname));
  const tip = useNavTip();
  // Not while a rollout is open on a phone (rollout declutter, Oct 18, 2026):
  // the rollout header's back arrow and the bottom bar's Artists already lead
  // out, and Artists / Rollouts above a rollout's title read as page chrome.
  // This row is below lg only, so the computer is unchanged.
  const rolloutOpen = useRolloutPhoneChrome((state) => state.rolloutOpen);

  // One highlight that slides between tabs (150ms, --motion-out; instant with
  // reduced motion), measured from the active tab. Until it is measured (the
  // server render, the first frame) the active tab draws its own background,
  // so the highlight is there from the first paint and never slides in from 0.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number; animate: boolean } | null>(null);
  const routeKey = tabs.find((tab) => tab.isActive(pathname))?.key ?? null;
  // The tab just tapped, before its page has arrived (Oct 18, 2026). The
  // highlight slides to it on the tap itself, instead of the old tab staying
  // lit for the ~250ms the page takes while the tapped one showed a sticky
  // hover box: two lit tabs, then a jump. Cleared when the address changes,
  // and after 3s in case the page never comes.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  useEffect(() => {
    setPendingKey(null);
  }, [pathname]);
  useEffect(() => {
    if (!pendingKey) return;
    const timer = window.setTimeout(() => setPendingKey(null), 3000);
    return () => window.clearTimeout(timer);
  }, [pendingKey]);
  const activeKey = pendingKey ?? routeKey;
  const measure = useCallback(
    (animate: boolean) => {
      const row = rowRef.current;
      const node = row?.querySelector<HTMLElement>('[data-tab-lit="true"]');
      if (!row || !node) {
        setPill(null);
        return;
      }
      setPill((previous) => ({
        left: node.offsetLeft,
        width: node.offsetWidth,
        animate: animate && previous !== null,
      }));
    },
    []
  );
  useLayoutEffect(() => {
    measure(true);
  }, [measure, activeKey, tabs.length, rolloutOpen]);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return;
    // Font swaps and rotation change tab widths; follow them without sliding.
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure, tabs.length, rolloutOpen]);

  if (tabs.length === 0 || rolloutOpen) return null;
  const activeTab = tabs.find((tab) => tab.key === activeKey) ?? null;

  return (
    <nav aria-label="Section" className="shell-band-sub lg:hidden">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-3 sm:px-5">
      <div ref={rowRef} className="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {pill ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-1/2 h-10 rounded-lg bg-bg-hover motion-reduce:!transition-none"
            style={{
              width: pill.width,
              transform: `translate(${pill.left}px, -50%)`,
              transition: pill.animate
                ? 'transform 150ms var(--motion-out), width 150ms var(--motion-out)'
                : 'none',
            }}
          />
        ) : null}
        {tabs.map((tab) => {
          const isActive = tab.isActive(pathname);
          const isLit = tab.key === activeKey;
          const onTap = (event: MouseEvent<HTMLAnchorElement>) => {
            if (tab.key === 'releases') leaveReleaseForCatalog();
            // A plain tap on another tab: light it now (see pendingKey).
            if (!isActive && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              setPendingKey(tab.key);
            }
          };
          return (
            <Link
              key={tab.key}
              href={tab.href}
              {...tip.bind(tab.key)}
              onClick={onTap}
              aria-current={isActive ? 'page' : undefined}
              data-tab-lit={isLit ? 'true' : undefined}
              ref={(node) => {
                if (node && isActive) node.scrollIntoView?.({ block: 'nearest', inline: 'center' });
              }}
              className={`motion-focus motion-press relative inline-flex h-10 shrink-0 items-center rounded-lg px-3.5 text-sm font-medium transition-colors ${NAV_TIP_TOUCH_CLASS} ${
                isLit
                  ? `${pill ? '' : 'bg-bg-hover '}text-content-primary`
                  : 'text-content-secondary [@media(hover:hover)]:hover:bg-bg-hover/60 [@media(hover:hover)]:hover:text-content-primary'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
        {tip.panel}
      </div>
      <div id={SUBNAV_SLOT_PHONE_END} className="flex h-9 w-9 shrink-0 items-center justify-center">
        <TabAction action={activeTab?.action ?? null} />
      </div>
      </div>
    </nav>
  );
}
