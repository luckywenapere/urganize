'use client';

import { useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  Disc3,
  Home,
  MicVocal,
  MoreHorizontal,
  Sparkles,
  Wallet2,
  X,
  type LucideProps,
} from '@/components/icons';
import { UserCircle2 } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { useSettingsLinkClick } from '@/components/settings/useOpenSettings';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { settingsDeepLink } from '@/lib/settings-nav';
import {
  activeMobileTab,
  buildMobileTabs,
  buildMoreItems,
  buildShellAreas,
  readShellFlags,
} from '@/lib/shell-nav';

type IconComponent = ComponentType<LucideProps>;

const TAB_ICON: Record<string, IconComponent> = {
  home: Home,
  catalogue: Disc3,
  urgans: Sparkles,
  shows: MicVocal,
};

/**
 * The phone's bottom bar: Home, Catalogue, UrgAns, Shows and More. Thumb
 * reachable, and the same destinations as the desktop pills, because both read
 * lib/shell-nav.ts.
 *
 * More opens a sheet with the areas the bar does not carry (Relationships,
 * Opportunities, Audience) plus credits and settings. Areas with nothing built
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

  return (
    <>
      <nav
        aria-label="Primary"
        className="mobile-nav-bar fixed inset-x-0 bottom-0 z-40 border-t border-stroke-default bg-bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto flex h-16 max-w-xl items-stretch">
          {tabs.map((tab) => {
            const Icon = TAB_ICON[tab.key] ?? Home;
            const isActive = active === tab.key;
            return (
              <li key={tab.key} className="flex-1">
                <Link
                  href={tab.href}
                  onClick={tab.key === 'catalogue' ? leaveReleaseForCatalog : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  data-tour={tab.key === 'catalogue' ? 'nav-catalog' : tab.key === 'urgans' ? 'nav-urgans' : `shell-mobile-${tab.key}`}
                  className={`motion-focus flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-brand' : 'text-content-tertiary'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {tab.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`motion-focus flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active === 'more' ? 'text-brand' : 'text-content-tertiary'
              }`}
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              More
            </button>
          </li>
        </ul>
      </nav>
      {moreOpen ? <MoreSheet areas={areas} onClose={() => setMoreOpen(false)} /> : null}
    </>
  );
}

function MoreSheet({
  areas,
  onClose,
}: {
  areas: ReturnType<typeof buildShellAreas>;
  onClose: () => void;
}) {
  const openSettings = useSettingsLinkClick();
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
                onClick={onClose}
                className="motion-focus flex min-h-14 items-center justify-between gap-3 text-base text-content-primary"
              >
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
      </DialogPanel>
    </div>,
    document.body
  );
}
