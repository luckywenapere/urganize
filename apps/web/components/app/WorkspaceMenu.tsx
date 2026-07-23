'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ExitIcon, GearIcon } from '@/components/app/BrandIcons';
import { useAuthStore } from '@/lib/auth-store';

type WorkspaceMenuProps = {
  /** Display name used to derive the monogram on the trigger. Falls back to
   * "U" when empty so the button is never blank. */
  userName?: string;
};

/**
 * Top-bar workspace menu. Replaces the avatar slot that briefly lived in the
 * topbar (and the workspace identity that lived in the sidebar footer pre-
 * Stage-2). Renders a square monogram trigger; clicking opens a small menu
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
export function WorkspaceMenu({ userName }: WorkspaceMenuProps) {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const monogram = (userName || 'U').trim().slice(0, 1).toUpperCase() || 'U';

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
    router.push('/settings');
  };

  const handleSignOut = async () => {
    setOpen(false);
    await logout();
    router.push('/auth');
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Workspace menu"
        className="motion-focus motion-press grid h-10 w-10 place-items-center rounded-full border border-stroke-default bg-bg-elevated text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover"
      >
        {monogram}
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Workspace menu"
          className="animate-menu-down absolute right-0 top-full z-50 mt-2 w-60 origin-top-right overflow-hidden rounded-xl border border-stroke-default bg-bg-surface shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]"
        >
          {/* Stage 2: the "Lucky / Workspace" identity used to live in the
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
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-elevated text-xs font-semibold text-content-primary">
              {monogram}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-content-primary">
                {userName?.trim() || 'Urganize'}
              </p>
              <p className="truncate text-[11px] text-content-tertiary">Workspace</p>
            </div>
          </div>

          <button
            ref={(el) => {
              itemRefs.current[0] = el;
            }}
            type="button"
            role="menuitem"
            onClick={handleSettings}
            onKeyDown={(event) => handleItemKeyDown(event, 0)}
            className="motion-focus flex w-full items-center gap-3 px-3 py-2.5 text-sm text-content-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover"
          >
            <GearIcon className="h-4 w-4 text-content-tertiary" />
            Settings
          </button>
          <button
            ref={(el) => {
              itemRefs.current[1] = el;
            }}
            type="button"
            role="menuitem"
            onClick={() => void handleSignOut()}
            onKeyDown={(event) => handleItemKeyDown(event, 1)}
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
