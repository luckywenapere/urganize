'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import {
  BadgeDollarSign,
  Disc3,
  Handshake,
  Inbox,
  MicVocal,
  Newspaper,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from '@/components/icons';
import { CatalogIcon, GearIcon, NotesIcon } from '@/components/app/BrandIcons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { useAuthStore } from '@/lib/auth-store';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { isCreditsEnabled } from '@/lib/credits/config';
import {
  buildMobileMenu,
  isMobileMenuItemActive,
  type MobileMenuFlags,
  type MobileMenuIcon,
  type MobileMenuItem,
} from '@/lib/mobile-menu';
import { isPlainLeftClick, readSettingsFlags, visibleSettingsSegments } from '@/lib/settings-nav';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';

const SWIPE_DISMISS_PX = 80;

type TileIcon = (props: { className?: string }) => ReactNode;

const ICONS: Record<MobileMenuIcon, TileIcon> = {
  catalog: CatalogIcon,
  notes: NotesIcon,
  shows: MicVocal,
  pitching: Radio,
  artists: Disc3,
  'press-kits': Newspaper,
  relationships: Handshake,
  directory: Users,
  'playlist-pitches': Inbox,
  settings: GearIcon,
  billing: BadgeDollarSign,
  credits: Sparkles,
  admin: ShieldCheck,
};

/** Read at call time, each as a literal `process.env` access, so Next inlines
 *  them (the readSettingsFlags precedent). Mirrors the gate each destination's
 *  own nav row uses. */
function readMenuFlags(): MobileMenuFlags {
  const workspace = process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';
  return {
    home: process.env.NEXT_PUBLIC_FEATURE_HOME === 'true',
    notes: process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true',
    events: process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true',
    pitching: process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true',
    artists: process.env.NEXT_PUBLIC_FEATURE_ARTIST_PAGE === 'true' && workspace,
    pressKits: process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true',
    relationships: process.env.NEXT_PUBLIC_FEATURE_RELATIONSHIPS === 'true' && workspace,
    directory: process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true',
    credits: isCreditsEnabled(),
  };
}

/**
 * The phone's Menu: a sheet of round buttons, grouped, with a Close button
 * pinned under them (founder call, 2026-10-04, from a reference screenshot).
 * Replaces the row of destination tabs the bottom bar used to carry.
 *
 * WHY A PORTAL. The bar is `fixed` with `backdrop-blur-xl`, and a
 * backdrop-filter makes an element the containing block for `fixed`
 * descendants, so a sheet mounted inside it would size itself against the 64px
 * bar. It renders into `document.body`, like every other sheet in this app.
 *
 * MECHANICS follow the sheet contract (ReleaseSetupSheet): z-[170], the shared
 * `task-outcome-sheet` keyframe, swipe-down on the handle and header only,
 * backdrop dismissal, ref-counted body scroll lock. Focus, the Tab trap and
 * Escape come from DialogPanel.
 *
 * THE SURFACES ARE A PAIRING, NOT A GUESS. `bg-bg-elevated` is the same colour
 * as `bg-bg-surface` in light mode, so a tile on an elevated well vanishes on
 * cream. Sheet = surface, well = base, tile = surface with a border: the one
 * stack that reads as raised in both themes (the share sheet records the same).
 */
export function MobileMenuSheet({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const openSettings = useOpenSettings();
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);
  const role = useAuthStore((state) => state.user?.role);
  const isAdmin = useWorkspaceIdentityStore((state) => state.isAdmin);

  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);

  useEffect(() => lockBodyScroll(), []);

  const groups = useMemo(() => {
    const canSeeBilling = visibleSettingsSegments({ role }, readSettingsFlags()).includes(
      'billing'
    );
    return buildMobileMenu({
      flags: readMenuFlags(),
      hasCuratorProfile,
      isAdmin,
      canSeeBilling,
    });
  }, [hasCuratorProfile, isAdmin, role]);

  const handleTouchStart = (event: React.TouchEvent) => {
    dragStartY.current = event.touches[0]?.clientY ?? null;
  };
  const handleTouchMove = (event: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - dragStartY.current;
    setDragOffset(Math.max(0, delta));
  };
  const handleTouchEnd = () => {
    dragStartY.current = null;
    if (dragOffset > SWIPE_DISMISS_PX) {
      onClose();
      return;
    }
    setDragOffset(0);
  };

  const handleItemClick = (event: React.MouseEvent<HTMLElement>, item: MobileMenuItem) => {
    // The two Settings tiles open the pop-up over this page; a modified click
    // falls through to the link's own deep link, so a new tab still works.
    if (item.settings && isPlainLeftClick(event)) {
      event.preventDefault();
      onClose();
      openSettings(item.settings);
      return;
    }
    // "Leave this release" forgets its remembered scene and records that the
    // catalog was asked for — the step every catalog control shares.
    if (item.leavesRelease) leaveReleaseForCatalog();
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/55 backdrop-blur-[2px] lg:hidden"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <DialogPanel
        label="Menu"
        onClose={onClose}
        className="task-outcome-sheet flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-stroke-strong bg-bg-surface shadow-[0_-18px_60px_-30px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))]"
      >
        {/* Drag region: the handle and the space around it only, so swiping
            never fights the scrolling grid below. */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="shrink-0 px-5 pb-2 pt-3"
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-stroke-strong" aria-hidden="true" />
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col"
          style={
            dragOffset > 0
              ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
              : { transform: 'translateY(0)', transition: 'transform 180ms var(--motion-out)' }
          }
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
            <div className="rounded-2xl bg-bg-base px-3 pb-4 pt-3">
              {groups.map((group, index) => (
                <section
                  key={group.key}
                  aria-labelledby={`mobile-menu-${group.key}`}
                  className={index === 0 ? '' : 'mt-5'}
                >
                  <h2
                    id={`mobile-menu-${group.key}`}
                    className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary"
                  >
                    {group.label}
                  </h2>
                  <ul className="mt-3 grid grid-cols-3 gap-x-2 gap-y-4">
                    {group.items.map((item) => {
                      const Icon = ICONS[item.icon];
                      const active = isMobileMenuItemActive(item, pathname);
                      return (
                        <li key={item.key} className="flex justify-center">
                          <Link
                            href={item.href}
                            onClick={(event) => handleItemClick(event, item)}
                            aria-current={active ? 'page' : undefined}
                            className="motion-focus motion-press group flex w-full flex-col items-center gap-2 rounded-2xl py-1"
                          >
                            <span
                              className={`grid h-16 w-16 place-items-center rounded-full border bg-bg-surface transition-colors ${
                                active
                                  ? 'border-brand text-brand'
                                  : 'border-stroke-default text-content-primary group-hover:border-stroke-strong'
                              }`}
                            >
                              <Icon className="h-6 w-6" />
                            </span>
                            <span
                              className={`text-center text-xs font-medium leading-4 ${
                                active ? 'text-brand' : 'text-content-primary'
                              }`}
                            >
                              {item.label}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>

          {/* Pinned: the way out stays under the thumb however long the grid is. */}
          <div className="flex shrink-0 justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="motion-focus motion-press flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full border border-stroke-strong bg-bg-base text-content-primary transition-colors hover:bg-bg-hover"
            >
              <X className="h-5 w-5" aria-hidden="true" />
              <span className="text-[10px] font-medium leading-none">Close</span>
            </button>
          </div>
        </div>
      </DialogPanel>
    </div>,
    document.body
  );
}
