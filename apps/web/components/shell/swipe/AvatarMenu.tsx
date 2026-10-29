'use client';

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  DoorOpen,
  HandshakeLine,
  Plug,
  Search,
  Settings,
  Users,
  X,
  type LucideProps,
} from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { useHomeStore } from '@/stores/useHomeStore';
import { useShellStore } from '@/stores/useShellStore';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { useHelpMenuGroups } from '@/components/app/HelpMenu';
import { useShellAreas } from '@/components/shell/useShellAreas';
import { describeRole, initialsFor } from '@/lib/swipe-nav';
import { SwipeSheet, SHEET_ROW } from './SwipeSheet';
import { ConnectionsSheet } from './ConnectionsSheet';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';

type Icon = ComponentType<LucideProps>;

/** Matched opportunities on Home: the "n new" on the Opportunities row. */
export function useNewOpportunities(): number {
  return useHomeStore(
    (state) => (state.data?.opportunities ?? []).filter((item) => item.source === 'suggested').length
  );
}

/** The green avatar: initials, with a small cream dot while something in the menu is new. */
export function AvatarFace({ size = 32, dot = false }: { size?: number; dot?: boolean }) {
  const name = useAuthStore((state) => state.user?.name || state.user?.email || '');
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-full bg-brand font-bold text-content-inverse"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.39), letterSpacing: '0.2px' }}
      aria-hidden="true"
    >
      {initialsFor(name)}
      {dot ? (
        <span className="absolute -right-px -top-px h-[9px] w-[9px] rounded-full bg-content-primary ring-2 ring-bg-base" />
      ) : null}
    </span>
  );
}

/**
 * The avatar menu (URG-380): everything the old More sheet held. On a phone a
 * bottom sheet; on a desktop a popover under the avatar. Profile, a search
 * field (the same search bar as ⌘K), Relationships, Opportunities with its new
 * count, Connections, Settings, and Help as a quiet last row that opens the
 * help list in place.
 */
export function AvatarMenu({ showHelp }: { showHelp: boolean }) {
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState(false);
  const newOpportunities = useNewOpportunities();
  const wrapRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktopViewport();

  // Desktop popover: a click outside or Escape closes it. Desktop only: on a
  // phone the menu is a SwipeSheet portalled to <body>, outside wrapRef, so
  // this listener would read every tap on a row as "outside" and close the
  // sheet on pointerdown, before the row's click could fire. The
  // sheet has its own scrim and close button.
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, isDesktop]);

  const close = () => setOpen(false);
  const openConnections = () => {
    setOpen(false);
    setConnections(true);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={newOpportunities > 0 ? 'Account and more, something new' : 'Account and more'}
        data-swipe-avatar
        className="motion-focus motion-press grid h-11 w-11 place-items-center rounded-full lg:h-12 lg:w-12"
      >
        <span className="lg:hidden">
          <AvatarFace size={32} dot={newOpportunities > 0} />
        </span>
        <span className="hidden lg:inline-grid">
          <AvatarFace size={40} dot={newOpportunities > 0} />
        </span>
      </button>

      {/* Desktop: a popover under the avatar. */}
      {open && isDesktop ? (
        <div
          role="dialog"
          aria-label="Account and more"
          className="animate-menu-down absolute right-0 top-full z-[160] mt-3 w-[20rem] origin-top-right rounded-[22px] border border-stroke-default bg-bg-surface p-4 shadow-2xl lg:block"
        >
          <MenuBody showHelp={showHelp} onClose={close} onConnections={openConnections} desktop />
        </div>
      ) : null}

      {/* Phone: a bottom sheet. */}
      <SwipeSheet open={open && !isDesktop} label="Account and more" onClose={close} desktop="phone">
        <MenuBody showHelp={showHelp} onClose={close} onConnections={openConnections} />
      </SwipeSheet>

      <ConnectionsSheet open={connections} onClose={() => setConnections(false)} />
    </div>
  );
}

function MenuBody({
  showHelp,
  onClose,
  onConnections,
  desktop = false,
}: {
  showHelp: boolean;
  onClose: () => void;
  onConnections: () => void;
  desktop?: boolean;
}) {
  const user = useAuthStore((state) => state.user);
  const workspaceName = useWorkspaceIdentityStore((state) => state.name);
  const openCommand = useShellStore((state) => state.openCommand);
  const openSettings = useOpenSettings();
  const helpGroups = useHelpMenuGroups();
  const helpItems = showHelp ? helpGroups.flat() : [];
  const areas = useShellAreas();
  const newOpportunities = useNewOpportunities();
  const [view, setView] = useState<'menu' | 'help'>('menu');

  const name = user?.name || user?.email || '';
  const role = describeRole(user?.role);
  const subline = [role, workspaceName].filter(Boolean).join(' · ');
  const relationships = areas.find((area) => area.key === 'relationships' && area.live) ?? null;
  const opportunities = areas.find((area) => area.key === 'opportunities') ?? null;
  // The Team tab (#853). On a phone this sheet is the swipe layout's menu, so
  // Team needs its row here; it takes the place Connections had (retired the
  // same day). A view that tucks Team (solo artist) has no team area.
  const team = areas.find((area) => area.key === 'team') ?? null;

  if (view === 'help') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setView('menu')}
          className="motion-focus -ml-1 flex min-h-11 items-center gap-1 rounded-md pr-2 text-sm text-content-tertiary"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          Back
        </button>
        <h2 className="pb-2 font-display text-2xl text-content-primary">Help</h2>
        <ul>
          {helpItems.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  item.onClick();
                }}
                className={`${SHEET_ROW} [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0 [&_svg]:text-content-primary/55`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.hint ? <span className="text-sm text-content-tertiary">{item.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <div className={`flex items-center gap-3.5 ${desktop ? 'pb-4' : 'pb-[18px] pt-1'}`}>
        <AvatarFace size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-content-primary">{name}</p>
          {subline ? <p className="truncate text-sm text-content-primary/55">{subline}</p> : null}
        </div>
        {desktop ? null : (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="motion-focus grid h-[34px] w-[34px] place-items-center rounded-full bg-content-primary/[0.06] text-content-primary/70"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          onClose();
          openCommand();
        }}
        className="motion-focus mb-1.5 flex h-[46px] w-full items-center gap-2.5 rounded-[14px] bg-content-primary/[0.06] px-3.5 text-left text-[15.5px] text-content-primary/45"
      >
        <Search className="h-[19px] w-[19px] text-content-primary/50" aria-hidden="true" />
        <span className="flex-1">{desktop ? 'Search' : 'Search releases, people, tasks'}</span>
        {desktop ? <kbd className="font-mono text-[11px] text-content-primary/40">⌘K</kbd> : null}
      </button>

      <ul>
        {relationships ? (
          <MenuLink href={relationships.href} icon={HandshakeLine} label="Relationships" onClose={onClose} />
        ) : null}
        {opportunities ? (
          <MenuLink
            href={opportunities.href}
            icon={DoorOpen}
            label="Opportunities"
            onClose={onClose}
            right={
              newOpportunities > 0 ? (
                <span className="mr-1.5 inline-flex items-center gap-1.5 text-[13px] text-brand">
                  <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
                  {newOpportunities} new
                </span>
              ) : null
            }
          />
        ) : null}
        {team ? <MenuLink href={team.href} icon={Users} label="Team" onClose={onClose} /> : null}
        <li>
          <button type="button" onClick={onConnections} className={SHEET_ROW}>
            <Plug className="h-[22px] w-[22px] shrink-0 text-content-primary/75" aria-hidden="true" />
            <span className="flex-1">Connections</span>
            <ChevronRight className="h-[18px] w-[18px] text-content-primary/35" aria-hidden="true" />
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => {
              onClose();
              openSettings();
            }}
            className={SHEET_ROW}
          >
            <Settings className="h-[22px] w-[22px] shrink-0 text-content-primary/75" aria-hidden="true" />
            <span className="flex-1">Settings</span>
            <ChevronRight className="h-[18px] w-[18px] text-content-primary/35" aria-hidden="true" />
          </button>
        </li>
        {helpItems.length > 0 ? (
          <li>
            <button
              type="button"
              onClick={() => setView('help')}
              className={`${SHEET_ROW} mt-1.5 text-base text-content-primary/60`}
            >
              <CircleHelp className="h-5 w-5 shrink-0 text-content-primary/50" aria-hidden="true" />
              <span className="flex-1">Help</span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function MenuLink({
  href,
  icon: IconComponent,
  label,
  right,
  onClose,
}: {
  href: string;
  icon: Icon;
  label: string;
  right?: ReactNode;
  onClose: () => void;
}) {
  return (
    <li>
      <Link href={href} onClick={onClose} className={SHEET_ROW}>
        <IconComponent className="h-[22px] w-[22px] shrink-0 text-content-primary/75" aria-hidden="true" />
        <span className="flex-1">{label}</span>
        {right}
        <ChevronRight className="h-[18px] w-[18px] text-content-primary/35" aria-hidden="true" />
      </Link>
    </li>
  );
}
