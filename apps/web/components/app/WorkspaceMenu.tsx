'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExitIcon, GearIcon, ProfileIcon } from '@/components/app/BrandIcons';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { ProfileFace } from '@/components/shared/ProfileFace';
import { useArtistFilterOptions } from '@/components/shell/useArtistFilter';
import { Check, Sparkles, Users } from '@/components/icons';
import { useUrgansUsage } from '@/components/app/useUrgansUsage';
import { useHelpMenuGroups } from '@/components/app/HelpMenu';
import { useKeepInViewport } from '@/lib/use-keep-in-viewport';
import { useGlide } from '@/lib/use-glide';

type WorkspaceMenuProps = {
  /** Display name shown in the menu's identity header. The trigger itself
   * renders the ProfileIcon (person shape), not initials. */
  userName?: string;
  /** Merged onto the root wrapper. AppTopbar uses this to hide the trigger
   * below lg when MobileNavBar's "You" tab already covers Settings/sign-out
   * there. */
  className?: string;
  /** The help rows (Report an issue, Docs, Contact us, Community, tour replay)
   *  that used to sit behind the top bar's `?` button. AppShell's showHelpMenu
   *  gate decides, exactly as it decided the `?` button. */
  showHelp?: boolean;
  /** Where the trigger sits (2026-10-17, founder: the profile icon moved from
   *  the top bar to the foot of the side menu, Apple Music style).
   *  - `row`: the open side menu. The icon and the name, as a side-menu row;
   *    the menu opens upward.
   *  - `rail`: the folded side menu, or the slim rail on a page with no side
   *    menu. The icon alone, centred; the menu opens to its right.
   *  - `topbar` (default): the round icon on its own, the menu below it. */
  placement?: 'row' | 'rail' | 'topbar';
  /** When this changes the icon glides from its old spot to its new one
   *  (lib/use-glide.ts). The side menu passes its folded state. */
  glideKey?: unknown;
};

/** Where the open menu sits for each trigger placement. From the side menu it
 *  opens up (the trigger is at the foot of the screen) and is capped to the
 *  screen with its own scroll, since useKeepInViewport leaves an upward menu
 *  to its own placement.
 *
 *  From the open side menu's row it is 14rem wide, the side menu's own width
 *  less its left inset, so it ends at the side menu's edge instead of running
 *  onto the page's first card (2026-10-17: at 16rem it sat on that card's left
 *  border). Nothing clips it there any more (Sidebar.tsx dropped its
 *  overflow-x-hidden), so its border and shadow show all round. */
const MENU_PLACEMENT: Record<NonNullable<WorkspaceMenuProps['placement']>, string> = {
  topbar: 'animate-menu-down right-0 top-full mt-2 w-64 origin-top-right',
  row: 'animate-menu-up bottom-full left-0 mb-2 w-56 origin-bottom-left max-h-[calc(100dvh-120px)] overflow-y-auto',
  rail: 'animate-menu-up bottom-0 left-full ml-2 w-64 origin-bottom-left max-h-[calc(100dvh-120px)] overflow-y-auto',
};

/**
 * The account menu at the foot of the desktop side menu (2026-10-17; before
 * that, at the right of the desktop top bar. The trigger is the
 * person icon (with a warning dot only when credits are low); since URG-255
 * (2026-10-14) the menu holds, top to bottom: who you are and which team, the artist
 * filter (when there is more than one artist), Settings, the credit balance
 * (when credits are on), the help rows that used to sit behind the `?` button,
 * and Sign out (the existing useAuthStore.logout flow, then /auth).
 *
 * Sign-out path is intentionally identical to the existing Settings → Log out
 * button (app/settings/page.tsx:710-715): await logout(); router.push('/auth').
 * Do not hand-roll a new sign-out — logout() is the one that clears the
 * Supabase session via supabase.auth.signOut() and the Zustand auth state.
 *
 * Keyboard model:
 *   - Trigger: Enter / Space toggles open
 *   - Menu open: focus jumps to the first item
 *   - Esc closes and returns focus to the trigger
 *   - ArrowDown / ArrowUp move between items (wrap-around)
 *   - Home / End jump to first / last
 *   - Tab moves to the next focusable in document order (we let the browser
 *     handle this — it closes the menu via the outside-click handler)
 *   - Outside click closes
 */
export function WorkspaceMenu({
  userName,
  className,
  showHelp = false,
  placement = 'topbar',
  glideKey,
}: WorkspaceMenuProps) {
  const router = useRouter();
  const openSettings = useOpenSettings();
  const logout = useAuthStore((state) => state.logout);
  // URG-214: the identity card (mounted app-wide) keeps this store hydrated
  // with the real team name. Falls back to a generic "Your team" when the
  // card's flag is off or hasn't loaded yet.
  const workspaceName = useWorkspaceIdentityStore((state) => state.name);
  // The artist filter moved here from the top bar's left block (2026-10-11).
  // Listed only when the roster has more than one artist.
  const { options: artistOptions, select: selectArtist } = useArtistFilterOptions();
  const settingsIndex = artistOptions.length;
  // Credits moved here from the top bar's chip (URG-255, 2026-10-14): one row,
  // "N credits", linking to the credit history. Nothing while the balance is
  // unknown or credits are off, exactly as the chip behaved.
  const credits = useUrgansUsage()?.credits ?? null;
  const creditTotal = credits ? Math.max(0, Math.floor(credits.total)) : 0;
  const creditLabel = `${creditTotal.toLocaleString('en')} ${creditTotal === 1 ? 'credit' : 'credits'}`;
  const creditsIndex = settingsIndex + 1;
  const helpGroups = useHelpMenuGroups();
  const helpItems = showHelp ? helpGroups.flat() : [];
  const helpStart = creditsIndex + (credits ? 1 : 0);
  const signOutIndex = helpStart + helpItems.length;
  const displayName = userName?.trim() || 'Urganize';
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLSpanElement>(null);
  useGlide(faceRef, glideKey);
  const isRow = placement === 'row';
  // With several artists and the help rows the menu can be taller than a
  // laptop screen; this caps it with its own scroll (lib/menu-position.ts).
  useKeepInViewport(menuRef, open);
  const itemRefs = useRef<Array<HTMLButtonElement | HTMLAnchorElement | null>>([]);

  const closeMenu = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) {
      // Defer one tick so React commits the closed state first; otherwise
      // the focus() can land on the trigger while the menu DOM is still up
      // and the next outside-click handler can re-process the same event.
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  // Outside-click close. mousedown (not click) so the menu closes before the
  // target receives its click, matching the behaviour of native OS menus and
  // every other dropdown in the app.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Esc close (global capture so the menu beats the page's own Esc handlers
  // — e.g. the create-release modal Esc — when the menu is the focused
  // surface).
  useEffect(() => {
    if (!open) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeMenu(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeMenu]);

  // Auto-focus first menu item on open. Without this, the menu opens but
  // focus stays on the trigger and ArrowDown does nothing — defeats the
  // keyboard a11y contract.
  useEffect(() => {
    if (open) {
      itemRefs.current[0]?.focus();
    }
  }, [open]);

  const handleItemKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const items = itemRefs.current.filter(Boolean) as HTMLElement[];
    if (items.length === 0) return;
    // Where this item sits among the rows on screen. The rows that come and go
    // (artists, credits, help) leave no gaps this way.
    const found = items.indexOf(event.currentTarget);
    index = found >= 0 ? found : index;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  const handleSettings = () => {
    setOpen(false);
    openSettings();
  };

  const handleSignOut = async () => {
    setOpen(false);
    await logout();
    router.push('/auth');
  };

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        data-tour="nav-settings"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={credits?.low ? 'Team menu, credits are low' : 'Team menu'}
        data-account-trigger={placement}
        className={
          isRow
            ? 'motion-focus group/account flex h-10 w-full min-w-0 items-center gap-3 rounded-lg pl-1 pr-2 text-left text-sm font-medium text-content-secondary transition-colors hover:bg-bg-hover/60 hover:text-content-primary aria-expanded:bg-bg-hover aria-expanded:text-content-primary'
            : 'motion-focus motion-press group/account grid h-10 w-10 place-items-center rounded-full'
        }
      >
        {/* Person icon, not initials (founder call, 2026-07-23) — drawn in
            the house style like the rest of the top bar set. The warning dot
            shows only when credits are low (URG-255). The circle is its own
            element so it can glide between the side menu's two corners. */}
        <span
          ref={faceRef}
          data-account-face
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-elevated text-content-secondary transition-colors group-hover/account:bg-bg-hover group-hover/account:text-content-primary"
        >
          <ProfileIcon className="h-[18px] w-[18px]" />
          {credits?.low ? (
            <span
              aria-hidden="true"
              data-credits-low-dot
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-status-warning ring-2 ring-bg-base"
            />
          ) : null}
        </span>
        {isRow ? <span className="min-w-0 flex-1 truncate">{displayName}</span> : null}
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Team menu"
          className={`${MENU_PLACEMENT[placement]} absolute z-50 overflow-hidden rounded-xl border border-stroke-default bg-bg-surface shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]`}
          // .animate-menu-up sets its own origin (bottom right); from the
          // side menu the menu grows out of the icon's corner instead.
          style={placement === 'topbar' ? undefined : { transformOrigin: 'bottom left' }}
        >
          {/* Stage 2: the "Oyin / Workspace" identity used to live in the
              sidebar footer. With the sidebar gone it lives here, as a
              non-interactive header above the menu items. Keeps the
              affordance the user relied on without re-introducing the
              rail. role="presentation" because this header is content,
              not a menuitem — screen readers should not announce it as
              actionable. */}
          <div
            role="presentation"
            className="flex items-center gap-3 border-b border-stroke-subtle px-3 py-3"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-elevated text-content-secondary">
              <ProfileIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-content-primary">
                {displayName}
              </p>
              <p className="truncate text-[11px] text-content-tertiary">
                {workspaceName.trim() || 'Your team'}
              </p>
            </div>
          </div>

          {artistOptions.length > 0 ? (
            <div role="group" aria-label="Showing" className="border-b border-stroke-subtle py-1">
              <p role="presentation" className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">
                Showing
              </p>
              {artistOptions.map((artist, index) => (
                <button
                  key={artist.id ?? 'all'}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={artist.active}
                  onClick={() => {
                    selectArtist(artist.id);
                    closeMenu(true);
                  }}
                  onKeyDown={(event) => handleItemKeyDown(event, index)}
                  className="motion-focus flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm text-content-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {artist.id ? (
                      <ProfileFace name={artist.name} photoUrl={artist.photoUrl} size={24} />
                    ) : (
                      <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full border border-stroke-default text-content-tertiary" style={{ width: 24, height: 24 }}>
                        <Users className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="truncate">{artist.name}</span>
                  </span>
                  {artist.active ? <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          ) : null}

          <button
            ref={(el) => {
              itemRefs.current[settingsIndex] = el;
            }}
            type="button"
            role="menuitem"
            onClick={handleSettings}
            onKeyDown={(event) => handleItemKeyDown(event, settingsIndex)}
            className="motion-focus flex w-full items-center gap-3 px-3 py-2.5 text-sm text-content-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover"
          >
            <GearIcon className="h-4 w-4 text-content-tertiary" />
            Settings
          </button>
          {credits ? (
            <Link
              ref={(el) => {
                itemRefs.current[creditsIndex] = el;
              }}
              href="/dashboard/credits"
              role="menuitem"
              onClick={() => setOpen(false)}
              onKeyDown={(event) => handleItemKeyDown(event, creditsIndex)}
              aria-label={`${creditLabel} left. Open credit history`}
              className={`motion-focus flex w-full items-center gap-3 px-3 py-2.5 text-sm tabular-nums transition-colors hover:bg-bg-hover focus:bg-bg-hover ${
                credits.low ? 'text-status-warning' : 'text-content-primary'
              }`}
            >
              <Sparkles className={`h-4 w-4 ${credits.low ? 'text-status-warning' : 'text-content-tertiary'}`} aria-hidden="true" />
              {creditLabel}
            </Link>
          ) : null}
          {helpItems.length > 0 ? (
            <div role="group" aria-label="Help" className="border-t border-stroke-subtle py-1">
              {helpItems.map((item, offset) => {
                const index = helpStart + offset;
                return (
                  <button
                    key={item.label}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      item.onClick();
                    }}
                    onKeyDown={(event) => handleItemKeyDown(event, index)}
                    className="motion-focus flex w-full items-center gap-3 px-3 py-2 text-sm text-content-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-content-tertiary"
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <button
            ref={(el) => {
              itemRefs.current[signOutIndex] = el;
            }}
            type="button"
            role="menuitem"
            onClick={() => void handleSignOut()}
            onKeyDown={(event) => handleItemKeyDown(event, signOutIndex)}
            className="motion-focus flex w-full items-center gap-3 border-t border-stroke-subtle px-3 py-2.5 text-sm text-content-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover"
          >
            <ExitIcon className="h-4 w-4 text-content-tertiary" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
