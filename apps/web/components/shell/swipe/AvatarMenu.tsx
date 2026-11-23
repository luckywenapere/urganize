'use client';

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  DoorOpen,
  Gauge,
  HandshakeLine,
  MessageSquare,
  Palette,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCircle,
  Users,
  X,
  type LucideProps,
} from '@/components/icons';
import { getTier } from '@urganize/pricing';
import { getTeamAccessClient, peekTeamAccessClient, type TeamAccessClientSnapshot } from '@/lib/team-billing-client';
import { readSettingsFlags, settingsDeepLink, visibleSettingsSegments, type SettingsSegment } from '@/lib/settings-nav';
import { useReportIssueStore } from '@/stores/useReportIssueStore';
import { MyFace } from '@/components/shared/AccountPhoto';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { useHomeStore } from '@/stores/useHomeStore';
import { useShellStore } from '@/stores/useShellStore';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { useHelpMenuGroups } from '@/components/app/HelpMenu';
import { useShellAreas } from '@/components/shell/useShellAreas';
import { describeRole, initialsFor } from '@/lib/swipe-nav';
import { SHEET_ROW } from './SwipeSheet';
import { openSettingsPage } from './settings-page';
import { useRouter } from 'next/navigation';
import { LogOut } from '@/components/icons';
import { Headphones as MusicHeadphones } from '@/components/icons/lucide';
import { musicHref } from '@/lib/music-host';
import { useHost } from '@/lib/use-host';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { useArtistFilterOptions } from '@/components/shell/useArtistFilter';
import { ProfileFace } from '@/components/shared/ProfileFace';

type Icon = ComponentType<LucideProps>;

/** Matched opportunities on Home: the "n new" on the Opportunities row. */
export function useNewOpportunities(): number {
  return useHomeStore(
    (state) => (state.data?.opportunities ?? []).filter((item) => item.source === 'suggested').length
  );
}

/** The green avatar: initials (or your photo, NEXT_PUBLIC_FEATURE_PROFILE_PHOTO),
 *  with a small cream dot while something in the menu is new. */
export function AvatarFace({ size = 32, dot = false }: { size?: number; dot?: boolean }) {
  const name = useAuthStore((state) => state.user?.name || state.user?.email || '');
  const initials = (
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
  // Same 9px dot and 2px bg-base ring on a photo, drawn above the hairline.
  const photoDot = dot ? (
    <span className="absolute -right-px -top-px z-[2] h-[9px] w-[9px] rounded-full bg-content-primary ring-2 ring-bg-base" />
  ) : null;
  // With the flag off (or no photo) this is exactly the initials face above.
  return <MyFace size={size} fallback={initials} overlay={photoDot} />;
}

/**
 * The avatar menu (URG-380): everything the old More sheet held. On a phone a
 * bottom sheet; on a desktop a popover under the avatar. Profile, a search
 * field (the same search bar as ⌘K), Relationships, Opportunities with its new
 * count, Settings, and Help as a quiet last row that opens the help list in
 * place.
 *
 * Connections was retired on 2026-10-29 (#860): its row and ConnectionsSheet
 * left this menu. The sheet file stays; to bring it back, re-add the row, the
 * `connections` state and the <ConnectionsSheet> mount (see git history of
 * this file at #860), and turn the Settings segment back on in settings-nav.
 */
export function AvatarMenu({ showHelp, settingsActive = false }: { showHelp: boolean; settingsActive?: boolean }) {
  const [open, setOpen] = useState(false);
  const newOpportunities = useNewOpportunities();
  const wrapRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktopViewport();
  const router = useRouter();

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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          // A phone opens the Settings page, the fourth page of the swipe row
          // (Nov 2, 2026). A computer keeps the popover.
          if (!isDesktop) {
            // A tap must not leave focus on the button: its focus ring was the
            // big green circle around the photo (founder, Nov 2, 2026).
            // Pointer taps only (detail > 0): Enter or Space keeps keyboard
            // focus (Codex review on #1032).
            if (event.detail > 0) (document.activeElement as HTMLElement | null)?.blur?.();
            openSettingsPage((href) => router.push(href));
            return;
          }
          setOpen((value) => !value);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={newOpportunities > 0 ? 'Account and more, something new' : 'Account and more'}
        data-swipe-avatar
        // The rollout tour's team step points here on a phone, where Team now
        // lives in the account page (#971, Nov 1, 2026).
        data-tour="nav-team"
        aria-current={settingsActive ? 'page' : undefined}
        // No ring around the 44px button: keyboard focus outlines the photo
        // itself, the same shape as the Settings outline.
        className="motion-press grid h-11 w-11 place-items-center rounded-full outline-none [&:focus-visible>span]:shadow-[0_0_0_2px_rgb(var(--color-brand))] lg:h-12 lg:w-12"
      >
        {/* While Settings shows, a thin light border hugs the photo itself, no
            gap (founder's reference, Nov 2, 2026), with a soft shadow so it
            reads on the cream background too. */}
        <span
          className={`grid place-items-center rounded-full transition-shadow lg:hidden ${
            settingsActive ? 'shadow-[0_0_0_3px_#fff,0_2px_10px_rgb(0_0_0/0.18)]' : ''
          }`}
        >
          <AvatarFace size={32} dot={newOpportunities > 0} />
        </span>
        <span
          className={`hidden rounded-full transition-shadow lg:inline-grid ${
            settingsActive ? 'shadow-[0_0_0_3px_#fff,0_2px_10px_rgb(0_0_0/0.18)]' : ''
          }`}
        >
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
          <MenuBody showHelp={showHelp} onClose={close} desktop />
        </div>
      ) : null}

    </div>
  );
}

export function MenuBody({
  showHelp,
  onClose,
  desktop = false,
  onOpenSegment,
  artistPicker = false,
  onSearch,
}: {
  showHelp: boolean;
  /** Computer Settings page: the "Showing" artist picker the old pop-up held. */
  artistPicker?: boolean;
  /** Computer Settings page: a round search button beside your name. */
  onSearch?: () => void;
  onClose: () => void;
  desktop?: boolean;
  /** The Settings page: rows open their setting inside the page instead of the
   *  pop-up, and there is no close button or search at the top (the page's
   *  search sits at the bottom). */
  onOpenSegment?: (segment: SettingsSegment, section: string | null) => void;
}) {
  const page = Boolean(onOpenSegment);
  const host = useHost();
  const user = useAuthStore((state) => state.user);
  const isAdmin = useWorkspaceIdentityStore((state) => state.isAdmin);
  const openCommand = useShellStore((state) => state.openCommand);
  const openSettings = useOpenSettings();
  const openReportIssue = useReportIssueStore((state) => state.openReportIssue);
  const helpGroups = useHelpMenuGroups();
  const helpItems = showHelp ? helpGroups.flat() : [];
  const areas = useShellAreas();
  const newOpportunities = useNewOpportunities();
  const [view, setView] = useState<'menu' | 'help'>('menu');

  const name = user?.name || user?.email || '';
  const role = describeRole(user?.role);
  const relationships = areas.find((area) => area.key === 'relationships' && area.live) ?? null;
  const opportunities = areas.find((area) => area.key === 'opportunities') ?? null;
  // The account page (Nov 1, 2026, founder approved docs/mocks/account-menu):
  // Team moved here from the top tabs, and every setting is one row away. A
  // row shows only when the person has that segment (visibleSettingsSegments),
  // so nobody gets a door the server would refuse.
  const segments = visibleSettingsSegments({ role: user?.role, isAdmin }, readSettingsFlags());
  const has = (segment: SettingsSegment) => segments.includes(segment);
  const inSettings = (segment: SettingsSegment, section?: string) => () => {
    if (onOpenSegment) {
      onOpenSegment(segment, section ?? null);
      return;
    }
    onClose();
    openSettings({ segment, section });
  };
  const plan = usePlanCard(has('billing'));
  const { options: artistOptions, select: selectArtist } = useArtistFilterOptions();

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
          {user?.email && user.email !== name ? (
            <p className="truncate text-sm text-content-primary/55">{user.email}</p>
          ) : role ? (
            <p className="truncate text-sm text-content-primary/55">{role}</p>
          ) : null}
        </div>
        {onSearch ? (
          <button
            type="button"
            onClick={onSearch}
            aria-label="Search settings"
            className="motion-focus motion-press grid h-11 w-11 place-items-center rounded-full bg-content-primary/[0.06] text-content-primary"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
        {desktop || page ? null : (
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

      {plan ? (
        <div className="mb-3 rounded-[20px] border border-content-primary/[0.07] bg-content-primary/[0.03] p-4">
          <p className="text-xs text-content-primary/55">{plan.eyebrow}</p>
          <p className="mt-0.5 font-display text-xl text-content-primary">{plan.title}</p>
          <button
            type="button"
            onClick={inSettings('billing')}
            className="motion-focus motion-press mt-3 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
          >
            {plan.action}
          </button>
        </div>
      ) : null}

      {artistPicker && artistOptions.length > 0 ? (
        <>
          <p className="mb-1.5 mt-1 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">Showing</p>
          <ul role="group" aria-label="Showing" className="mb-3 rounded-[20px] border border-content-primary/[0.07] bg-content-primary/[0.03] px-4">
            {artistOptions.map((artist) => (
              <li key={artist.id ?? 'all'}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={artist.active}
                  onClick={() => selectArtist(artist.id)}
                  className={SHEET_ROW}
                >
                  {artist.id ? (
                    <ProfileFace name={artist.name} photoUrl={artist.photoUrl} size={24} />
                  ) : (
                    <Users className="h-[22px] w-[22px] shrink-0 text-content-primary/75" aria-hidden="true" />
                  )}
                  <span className="flex-1 truncate">{artist.name}</span>
                  {artist.active ? <Check className="h-[18px] w-[18px] text-brand" aria-hidden="true" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {page ? null : (
      <button
        type="button"
        onClick={() => {
          onClose();
          openCommand();
        }}
        className="motion-focus mb-3 flex h-[46px] w-full items-center gap-2.5 rounded-[14px] bg-content-primary/[0.06] px-3.5 text-left text-[15.5px] text-content-primary/45"
      >
        <Search className="h-[19px] w-[19px] text-content-primary/50" aria-hidden="true" />
        <span className="flex-1">{desktop ? 'Search' : 'Search releases, people, tasks'}</span>
        {desktop ? <kbd className="font-mono text-[11px] text-content-primary/40">⌘K</kbd> : null}
      </button>
      )}

      <MenuGroup>
        <ActionRow icon={UserCircle} label="Profile" onClick={inSettings('general', 'name')} />
        {String(user?.role || '').toLowerCase() === 'curator' ? null : (
          <MenuLink href={settingsDeepLink({ segment: 'team' })} icon={Users} label="Team" onClose={onClose} />
        )}
        {has('artists') ? <ActionRow icon={Palette} label="Artists & brand" onClick={inSettings('artists')} /> : null}
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
      </MenuGroup>

      <MenuGroup>
        {has('notifications') ? <ActionRow icon={Bell} label="Notifications" onClick={inSettings('notifications')} /> : null}
        {has('urgans') ? <ActionRow icon={Sparkles} label="AI" onClick={inSettings('urgans')} /> : null}
        <ActionRow icon={SlidersHorizontal} label="Appearance" onClick={inSettings('general', 'theme')} />
        {has('security') ? <ActionRow icon={ShieldCheck} label="Security & account" onClick={inSettings('security')} /> : null}
        {/* Trash keeps its one door here now that Delete rollouts left Settings: a deleted rollout waits 30 days there. */}
        {String(user?.role || '').toLowerCase() === 'curator' ? null : (
          <MenuLink href="/dashboard/trash" icon={Trash2} label="Trash" onClose={onClose} />
        )}
        {/* The way back to the listening side (#1364). */}
        <MenuLink href={musicHref(host)} icon={MusicHeadphones} label="Urganize Music" onClose={onClose} />
        {has('admin') ? <ActionRow icon={Gauge} label="Admin" onClick={inSettings('admin')} /> : null}
      </MenuGroup>

      {helpItems.length > 0 || REPORT_ISSUE_ENABLED ? (
        <MenuGroup>
          {helpItems.length > 0 ? <ActionRow icon={CircleHelp} label="Help" onClick={() => setView('help')} /> : null}
          {REPORT_ISSUE_ENABLED ? (
            <ActionRow
              icon={MessageSquare}
              label="Send feedback"
              onClick={() => {
                onClose();
                openReportIssue('bug');
              }}
            />
          ) : null}
        </MenuGroup>
      ) : null}
      {page ? <LogOutRow /> : null}
    </div>
  );
}

/** The Settings page's last row: sign out, the one thing the old pop-up's list held. */
function LogOutRow() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const email = useAuthStore((state) => state.user?.email ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <div className="mb-3 mt-1">
      {email ? <p className="mb-2 px-1 text-[13px] text-content-primary/55">Signed in as {email}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await logout();
            router.push('/auth');
          } finally {
            setBusy(false);
          }
        }}
        className="motion-focus motion-press flex min-h-[52px] w-full items-center gap-3 rounded-[20px] border border-content-primary/[0.07] bg-content-primary/[0.03] px-4 text-left text-[17px] text-content-primary disabled:opacity-60"
      >
        <LogOut className="h-[20px] w-[20px] text-content-primary/75" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

const REPORT_ISSUE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_REPORT_ISSUE === 'true';

/** What the plan card says, or null when this person has no plan to manage
 *  (a teammate on somebody else's plan never gets the Billing segment). */
export function usePlanCard(canBill: boolean): { eyebrow: string; title: string; action: string } | null {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [team, setTeam] = useState<TeamAccessClientSnapshot | null>(() => (userId ? peekTeamAccessClient(userId) : null));
  useEffect(() => {
    if (!canBill || !userId) return;
    let cancelled = false;
    void getTeamAccessClient(userId).then((snapshot) => {
      if (!cancelled) setTeam(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [canBill, userId]);
  if (!canBill || !team) return null;
  if (team.state === 'trial') {
    const days = Math.max(0, team.trialDaysLeft);
    return { eyebrow: 'Your trial', title: `${days} ${days === 1 ? 'day' : 'days'} left`, action: 'Choose a plan' };
  }
  if ((team.state === 'paid' || team.state === 'comped') && team.tier) {
    return { eyebrow: 'Your plan', title: getTier(team.tier).label, action: 'Manage plan' };
  }
  return null;
}

/** A card of rows, like the account page's three groups. */
function MenuGroup({ children }: { children: ReactNode }) {
  return (
    <ul className="mb-3 rounded-[20px] border border-content-primary/[0.07] bg-content-primary/[0.03] px-4">{children}</ul>
  );
}

function ActionRow({ icon: IconComponent, label, onClick }: { icon: Icon; label: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={SHEET_ROW}>
        <IconComponent className="h-[22px] w-[22px] shrink-0 text-content-primary/75" aria-hidden="true" />
        <span className="flex-1">{label}</span>
        <ChevronRight className="h-[18px] w-[18px] text-content-primary/35" aria-hidden="true" />
      </button>
    </li>
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
