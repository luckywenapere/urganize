'use client';

import { hasPullReveal, revealListSearch } from '@/components/shared/PullReveal';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@urganize/ui';
import {
  Search,
  ShieldCheck,
  Sparkles,
  Wallet2,
  type LucideProps,
} from '@/components/icons';
import { NotificationsBell } from '@/components/app/NotificationsBell';
import { HelpMenu } from '@/components/app/HelpMenu';
import { WorkspaceMenu } from '@/components/app/WorkspaceMenu';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { activeShellArea, buildShellAreas, readShellFlags } from '@/lib/shell-nav';
import { useShellStore } from '@/stores/useShellStore';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { ArtistSwitcher } from './ArtistSwitcher';
import { CreditsChip } from './CreditsChip';

type IconComponent = ComponentType<LucideProps>;

const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

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
                onClick={area.key === 'catalogue' ? leaveReleaseForCatalog : undefined}
                aria-current={isActive ? 'page' : undefined}
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
          <MoreMenu />
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

/** The overflow for things that are not one of the six areas: the UrgAns page,
 *  credit history and, for an admin, Admin. A plain disclosure (Tab and Enter,
 *  Escape closes), not a menu role, because it does not move focus with arrows. */
function MoreMenu() {
  const isAdmin = useWorkspaceIdentityStore((state) => state.isAdmin);
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const items: Array<{ href: string; label: string; Icon: IconComponent }> = [];
  if (CHAPPI_ENABLED) items.push({ href: '/dashboard/urgans', label: 'UrgAns chats', Icon: Sparkles });
  items.push({ href: '/dashboard/credits', label: 'Credits', Icon: Wallet2 });
  if (isAdmin) items.push({ href: '/admin', label: 'Admin', Icon: ShieldCheck });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className="motion-focus motion-press inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-2.5 text-sm font-medium text-content-secondary hover:bg-bg-hover/70 xl:px-3.5 hover:text-content-primary"
      >
        More
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-stroke-default bg-bg-surface p-1.5 shadow-lg">
          {items.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={pathname.startsWith(href) ? 'page' : undefined}
              className="motion-focus flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm text-content-primary hover:bg-bg-hover"
            >
              <Icon className="h-4 w-4 text-content-tertiary" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
