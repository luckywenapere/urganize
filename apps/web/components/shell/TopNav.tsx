'use client';

import { hasPullReveal, revealListSearch } from '@/components/shared/PullReveal';
import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { Search } from '@/components/icons';
import { NotificationsBell } from '@/components/app/NotificationsBell';
import { HelpMenu } from '@/components/app/HelpMenu';
import { WorkspaceMenu } from '@/components/app/WorkspaceMenu';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { activeShellArea, buildShellAreas, readShellFlags } from '@/lib/shell-nav';
import { useShellStore } from '@/stores/useShellStore';
import { useHomeChatStore } from '@/stores/useHomeChatStore';
import { ArtistSwitcher } from './ArtistSwitcher';
import { CreditsChip } from './CreditsChip';
import { useNavTip } from './useNavTip';

/**
 * The top bar (design overhaul, 2026-10-04): the Deel shell with Urganize's skin.
 *
 * Left to right: the mark, the team and artist switcher, the six areas as
 * pills, then search, credits, help, notifications and the account menu. Below
 * `lg` the pills hand over to the bottom bar (BottomBar), leaving the switcher,
 * search, the bell and the account here.
 *
 * The soft tinted band behind it is the brand colour at a whisper, Deel's
 * lavender done in spring green; it fades into the page so the bar reads as part
 * of the surface and not a fixed slab on top of it.
 *
 * Every destination comes from lib/shell-nav.ts, so what is offered here, in the
 * sub-tab row and on a phone cannot disagree.
 */
export function TopNav({ userName }: { userName?: string }) {
  const pathname = usePathname() ?? '/dashboard';
  const areas = useMemo(() => buildShellAreas(readShellFlags()), []);
  const active = activeShellArea(areas, pathname);
  const openCommand = useShellStore((state) => state.openCommand);
  const tip = useNavTip();
  const listCollapsed = useHomeChatStore((state) => state.listCollapsed);

  return (
    <header className="shell-band sticky top-0 z-30">
      <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:px-8">
        <Link
          href="/dashboard/home"
          aria-label="Urganize home"
          className="motion-focus shrink-0 rounded-md transition-opacity hover:opacity-80"
        >
          <Logo size="sm" priority className="opacity-95" />
        </Link>

        <span aria-hidden="true" className="hidden h-8 w-px shrink-0 bg-stroke-default sm:block" />

        <ArtistSwitcher />

        <nav aria-label="Main" className="mx-auto hidden min-w-0 items-center gap-0.5 lg:flex xl:gap-1">
          {areas.map((area) => {
            const isActive = active?.key === area.key;
            return (
              <Link
                key={area.key}
                href={area.href}
                {...tip.bind(area.key)}
                onClick={(event) => {
                  if (area.key === 'catalogue') leaveReleaseForCatalog();
                  // On Home, the Home pill folds Home's left column away so the
                  // chat fills the width; pressing it again brings it back.
                  if (area.key === 'home' && pathname === area.href) {
                    event.preventDefault();
                    useHomeChatStore.getState().toggleListCollapsed();
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
                aria-expanded={area.key === 'home' && pathname === area.href ? !listCollapsed : undefined}
                aria-controls={area.key === 'home' && pathname === area.href ? 'home-list-column' : undefined}
                data-tour={area.key === 'catalogue' ? 'nav-catalog' : `shell-${area.key}`}
                className={`motion-focus motion-press inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-2.5 text-sm font-medium transition-colors xl:px-3.5 ${
                  isActive
                    ? 'bg-bg-surface text-content-primary shadow-sm ring-1 ring-stroke-default'
                    : 'text-content-secondary hover:bg-bg-hover/70 hover:text-content-primary'
                }`}
              >
                {area.label}
              </Link>
            );
          })}
          {tip.panel}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 lg:ml-0">
          <button
            type="button"
            onClick={() => (hasPullReveal() ? revealListSearch() : openCommand())}
            data-tour="shell-search"
            aria-label="Search or ask UrgAns"
            className="motion-focus motion-press inline-flex h-10 items-center gap-2 rounded-full border border-stroke-default bg-bg-surface/70 px-2.5 text-sm text-content-secondary hover:text-content-primary sm:px-3"
          >
            <Search className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          <CreditsChip />
          <span className="hidden xl:contents">
            <HelpMenu />
          </span>
          <NotificationsBell />
          <WorkspaceMenu userName={userName} />
        </div>
      </div>
    </header>
  );
}
