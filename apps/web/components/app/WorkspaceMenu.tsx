'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ExitIcon, GearIcon, ProfileIcon } from '@/components/app/BrandIcons';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { useArtistFilterOptions } from '@/components/shell/useArtistFilter';
import { Check } from '@/components/icons';

type WorkspaceMenuProps = {
  /** Display name shown in the menu's identity header. The trigger itself
   * renders the ProfileIcon (person shape), not initials. */
  userName?: string;
  /** Merged onto the root wrapper. AppTopbar uses this to hide the trigger
   * below lg when MobileNavBar's "You" tab already covers Settings/sign-out
   * there. */
  className?: string;
};

/**
 * Top-bar workspace menu. Replaces the avatar slot that briefly lived in the
 * topbar (and the workspace identity that lived in the sidebar footer pre-
 * Stage-2). Renders a round person-icon trigger; clicking opens a small menu
 * with exactly two items: Settings (navigates to /settings) and Sign out
 * (calls the existing useAuthStore.logout flow, then redirects to /auth).
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
export function WorkspaceMenu({ userName, className }: WorkspaceMenuProps) {
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  const handleItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (items.length === 0) return;

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
        aria-label="Team menu"
        className="motion-focus motion-press grid h-10 w-10 place-items-center rounded-full border border-stroke-default bg-bg-elevated text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        {/* Person icon, not initials (founder call, 2026-07-23) — drawn in
            the house style like the rest of the topbar set. */}
        <ProfileIcon className="h-[18px] w-[18px]" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Team menu"
          className="animate-menu-down absolute right-0 top-full z-50 mt-2 w-60 origin-top-right overflow-hidden rounded-xl border border-stroke-default bg-bg-surface shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]"
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
                {userName?.trim() || 'Urganize'}
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
                  <span className="truncate">{artist.name}</span>
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
          <button
            ref={(el) => {
              itemRefs.current[settingsIndex + 1] = el;
            }}
            type="button"
            role="menuitem"
            onClick={() => void handleSignOut()}
            onKeyDown={(event) => handleItemKeyDown(event, settingsIndex + 1)}
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
