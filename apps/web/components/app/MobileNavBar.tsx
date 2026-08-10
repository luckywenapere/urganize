'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useChappiStore } from '@/stores/useChappiStore';
import { CatalogIcon, ChappiIcon, NotesIcon, ProfileIcon } from '@/components/app/BrandIcons';

// Same flags AppTopbar reads — a tab only exists in the bar when its surface
// exists at all.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

type MobileNavBarProps = {
  /** Opens the CreateReleaseModal AppShell owns — the same instance the
   * topbar's "New release" button and the ChappiDock's card use. */
  onNewRelease: () => void;
};

/**
 * Bottom tab bar, below lg only (NEXT_PUBLIC_FEATURE_MOBILE_NAV). Moves the
 * topbar's nav icons and the "New release" CTA down to where a thumb
 * actually reaches on a phone, and stands in for the ChappiDock launcher
 * (which retires on this same viewport range — see ChappiDock.tsx).
 *
 * Five slots: Home (Catalog) · UrgAns · New release (center, filled) · Notes
 * · You. "You" is a direct Link to /settings rather than a menu — the
 * account actions (Settings, sign out) already live there, and a menu on top
 * of a menu (WorkspaceMenu still exists at lg+) would be one tap for nothing.
 *
 * The bar shows on every route AppShell mounts it on, /dashboard/urgans
 * included — hiding it there would leave the assistant page with no way out
 * except the topbar logo, since this bar just became the only navigation on
 * mobile. To keep typing on that page (or any in-page form) from fighting the
 * bar for the keyboard's space, useKeyboardOpen hides it while the on-screen
 * keyboard is up — Android's `interactiveWidget: 'resizes-content'` shrinks
 * the layout viewport when the keyboard opens, and a `fixed bottom-0` bar
 * would otherwise ride up and sit on top of it.
 */
export function MobileNavBar({ onNewRelease }: MobileNavBarProps) {
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();

  const isHome = pathname === '/dashboard';
  const isUrgAns = pathname === '/dashboard/urgans';
  const isNotes = pathname === '/dashboard/notes';
  const isSettings = pathname?.startsWith('/settings') ?? false;

  const handleUrgAnsClick = () => {
    // Carry the drilled-in release as the assistant's scope, mirroring
    // ChappiTopbarAction's stacked (below-lg) branch — this bar only ever
    // renders below lg, so there is no rail-toggle branch to mirror too.
    // Reading location.search directly (rather than useSearchParams) keeps
    // this whole component Suspense-free.
    if (typeof window === 'undefined' || !isHome) return;
    const releaseId = new URLSearchParams(window.location.search).get('release');
    if (releaseId) {
      useChappiStore.getState().setScopedReleaseId(releaseId);
    }
  };

  return (
    <nav
      aria-label="Primary"
      className={`mobile-nav-bar fixed inset-x-0 bottom-0 z-30 border-t border-stroke-subtle bg-bg-base/88 backdrop-blur-xl lg:hidden ${
        keyboardOpen ? 'hidden' : ''
      }`}
    >
      <ul className="flex h-16 w-full items-stretch">
        <li className="flex-1">
          <Link
            href="/dashboard"
            aria-current={isHome ? 'page' : undefined}
            className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
              isHome ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
            }`}
          >
            <CatalogIcon className="h-5 w-5" />
            Home
          </Link>
        </li>

        {CHAPPI_ENABLED ? (
          <li className="flex-1">
            <Link
              href="/dashboard/urgans"
              onClick={handleUrgAnsClick}
              aria-current={isUrgAns ? 'page' : undefined}
              className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isUrgAns ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              <ChappiIcon className="h-5 w-5" />
              UrgAns
            </Link>
          </li>
        ) : null}

        <li className="flex-1">
          <button
            type="button"
            onClick={onNewRelease}
            aria-label="New release"
            title="New release"
            className="motion-focus motion-press mx-auto grid h-12 w-12 place-items-center self-center rounded-full border border-brand/25 bg-brand text-content-inverse shadow-[0_18px_36px_-28px_rgb(var(--color-brand)/0.55)] hover:bg-brand-hover"
          >
            <Plus className="h-5 w-5" />
          </button>
        </li>

        {NOTES_ENABLED ? (
          <li className="flex-1">
            <Link
              href="/dashboard/notes"
              aria-current={isNotes ? 'page' : undefined}
              className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                isNotes ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              <NotesIcon className="h-5 w-5" />
              Notes
            </Link>
          </li>
        ) : null}

        <li className="flex-1">
          <Link
            href="/settings"
            aria-current={isSettings ? 'page' : undefined}
            className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
              isSettings ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
            }`}
          >
            <ProfileIcon className="h-5 w-5" />
            You
          </Link>
        </li>
      </ul>
    </nav>
  );
}

// How far the viewport has to shrink before we call it "the keyboard is
// open" rather than a rotation or a browser chrome change. 150px comfortably
// clears both without needing a device/UA check.
const KEYBOARD_SHRINK_THRESHOLD_PX = 150;

/**
 * True while the on-screen keyboard is covering enough of the viewport that a
 * fixed bottom bar would sit on top of it. Tracks window.visualViewport where
 * available (the accurate signal for Android's `resizes-content` shrink) and
 * falls back to window.resize. The baseline resets on an orientation/width
 * change so rotating the device doesn't get mistaken for a keyboard.
 */
function useKeyboardOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let baselineHeight = window.visualViewport?.height ?? window.innerHeight;
    let baselineWidth = window.innerWidth;

    const check = () => {
      const currentWidth = window.innerWidth;
      if (currentWidth !== baselineWidth) {
        // Orientation or window resize, not a keyboard — re-baseline instead
        // of reading it as a shrink.
        baselineWidth = currentWidth;
        baselineHeight = window.visualViewport?.height ?? window.innerHeight;
        setIsOpen(false);
        return;
      }
      const currentHeight = window.visualViewport?.height ?? window.innerHeight;
      setIsOpen(baselineHeight - currentHeight > KEYBOARD_SHRINK_THRESHOLD_PX);
    };

    window.addEventListener('resize', check);
    window.visualViewport?.addEventListener('resize', check);
    return () => {
      window.removeEventListener('resize', check);
      window.visualViewport?.removeEventListener('resize', check);
    };
  }, []);

  return isOpen;
}
