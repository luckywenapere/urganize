'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home as HomeIcon, LayoutGrid } from '@/components/icons';
import { useKeyboardOpen } from '@/lib/keyboard-viewport';
import { useChappiStore } from '@/stores/useChappiStore';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { ChappiIcon } from '@/components/app/BrandIcons';

// The sheet is code only a tap needs, and this bar is mounted app-wide.
const MobileMenuSheet = dynamic(
  () => import('@/components/app/MobileMenuSheet').then((m) => m.MobileMenuSheet),
  { ssr: false }
);

const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
const HOME_ENABLED = process.env.NEXT_PUBLIC_FEATURE_HOME === 'true';

/** Icon components come from two families — hand-drawn BrandIcons return
 *  ReactElement, the house/lucide sets type theirs as ReactElement | null — so
 *  this is deliberately widened to ReactNode rather than making every icon
 *  need a wrapper (the `MetadataIcon` problem, recorded in CLAUDE.md). */
type TabIcon = (props: { className?: string }) => ReactNode;

/** A flat tab's look, shared by Home and Menu. Active lights up in the brand
 *  colour, which is also what `aria-current` is for. */
function tabClass(isActive: boolean): string {
  return `motion-focus flex h-full w-full flex-col items-center justify-center gap-1 transition-colors ${
    isActive ? 'text-brand' : 'text-content-tertiary hover:text-content-secondary'
  }`;
}

function TabLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-medium leading-none">{children}</span>;
}

/** A plain destination tab, `<li>` included. */
function NavTab({
  href,
  label,
  Icon,
  isActive,
  onClick,
  dataTour,
}: {
  href: string;
  label: string;
  Icon: TabIcon;
  isActive: boolean;
  onClick?: () => void;
  /** Guided-tour anchor (lib/tours.ts). Inert without the flag: it is an
   *  attribute nothing reads until TourOverlay looks for it. */
  dataTour?: string;
}) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        onClick={onClick}
        data-tour={dataTour}
        aria-current={isActive ? 'page' : undefined}
        className={tabClass(isActive)}
      >
        <Icon className="h-5 w-5" />
        <TabLabel>{label}</TabLabel>
      </Link>
    </li>
  );
}

/**
 * Bottom bar, below lg only (NEXT_PUBLIC_FEATURE_MOBILE_NAV): Home · the UrgAns
 * orb · Menu (founder call, 2026-10-04, from a reference screenshot). Three
 * slots, however many features are switched on: every other destination lives
 * in the sheet the Menu button opens (MobileMenuSheet, decided by
 * lib/mobile-menu.ts), so the bar never has to be rearranged for a new surface
 * and never outgrows a phone's width — the ceiling the old row of tabs kept
 * having to document.
 *
 * HOME. With NEXT_PUBLIC_FEATURE_HOME on it is the Home page; with it off it is
 * the catalog, which is what this bar's left tab has always meant. With Home on
 * the catalog gets a tile in the sheet instead, so it is never unreachable.
 * Tapping it while a rollout is scoped means "leave this rollout", the same
 * step the back arrow, the side menu's Catalog row and the topbar's Catalog
 * icon take (lib/catalog-intent.ts) — read at click time rather than through
 * `useSearchParams`, so this bar stays free of a Suspense boundary and
 * `/settings` stays `○ Static`.
 *
 * THE ORB is UrgAns (founder call): it goes to /dashboard/urgans, carrying the
 * drilled-in rollout as the assistant's scope when tapped from the catalog. It
 * is the one control in the bar that is not a flat tab, lifted above the bar's
 * top edge the way the reference lifts its assistant orb. With the assistant
 * switched off it is simply absent and the bar is Home · Menu.
 *
 * LABELS ARE VISIBLE AGAIN. They were `sr-only` from 2026-08-31 ("icons only,
 * to save width") because the bar then held up to eight icons; with three slots
 * there is nothing to save, and the reference shows them. Flip `TabLabel` back
 * to `sr-only` to return to icons only.
 *
 * Everything the old bar carried and this one does not (Shows, the Playlist
 * pitches crossing, and the destinations founder calls had already moved out of
 * it) is a tile in the sheet, gated on the same flags its own nav row is, so no
 * viewport or flag band loses an entry point.
 *
 * The bar shows on every route AppShell mounts it on, /dashboard/urgans
 * included — hiding it there would leave the assistant page with no way out
 * except the topbar logo. useKeyboardOpen hides it while the on-screen keyboard
 * is up, so typing does not fight the bar for the keyboard's space.
 */
export function MobileNavBar() {
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();
  const [menuOpen, setMenuOpen] = useState(false);

  const isCatalog = pathname === '/dashboard';
  const isDashboardHome = pathname === '/dashboard/home';
  const isUrgAns = pathname === '/dashboard/urgans';

  const handleHomeClick = () => {
    // NO `if (!isCatalog) return` guard: the catalog INTENT has to be recorded
    // from every page, because the page it is recorded from is precisely the
    // page whose remount would otherwise auto-scope the user straight back
    // into their only rollout. See lib/catalog-intent.ts.
    if (!HOME_ENABLED) leaveReleaseForCatalog();
  };

  const handleUrgAnsClick = () => {
    // Carry the drilled-in rollout as the assistant's scope. Reading
    // location.search directly keeps this whole component Suspense-free.
    if (typeof window === 'undefined' || !isCatalog) return;
    const releaseId = new URLSearchParams(window.location.search).get('release');
    if (releaseId) {
      useChappiStore.getState().setScopedReleaseId(releaseId);
    }
  };

  // Hide the sheet along with the bar so a keyboard never leaves it floating.
  const sheetOpen = menuOpen && !keyboardOpen;

  return (
    <>
      <nav
        aria-label="Primary"
        className={`mobile-nav-bar fixed inset-x-0 bottom-0 z-30 border-t border-stroke-subtle bg-bg-base/88 backdrop-blur-xl lg:hidden ${
          keyboardOpen ? 'hidden' : ''
        }`}
      >
        <div className="flex h-16 w-full items-stretch">
          <ul className="flex w-full items-stretch">
            {HOME_ENABLED ? (
              <NavTab
                href="/dashboard/home"
                label="Home"
                dataTour="nav-home"
                Icon={HomeIcon}
                isActive={isDashboardHome}
              />
            ) : (
              <NavTab
                href="/dashboard"
                label="Home"
                dataTour="nav-catalog"
                Icon={HomeIcon}
                isActive={isCatalog}
                onClick={handleHomeClick}
              />
            )}

            {CHAPPI_ENABLED ? (
              <li className="flex flex-1 items-start justify-center">
                <Link
                  href="/dashboard/urgans"
                  onClick={handleUrgAnsClick}
                  data-tour="nav-urgans"
                  aria-current={isUrgAns ? 'page' : undefined}
                  className="motion-focus motion-press -mt-5 grid h-14 w-14 place-items-center rounded-full border border-brand/40 text-content-inverse ring-4 ring-bg-base"
                  style={{
                    background:
                      'radial-gradient(circle at 30% 25%, rgb(var(--color-brand)) 0%, rgb(var(--color-brand) / 0.7) 55%, rgb(var(--color-brand) / 0.45) 100%)',
                    boxShadow: isUrgAns
                      ? '0 0 0 2px rgb(var(--color-brand) / 0.5), 0 8px 24px -8px rgb(var(--color-brand) / 0.8)'
                      : '0 8px 24px -10px rgb(var(--color-brand) / 0.7)',
                  }}
                >
                  <ChappiIcon className="h-6 w-6" />
                  <span className="sr-only">UrgAns</span>
                </Link>
              </li>
            ) : null}

            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                data-tour="nav-menu"
                className={tabClass(sheetOpen)}
              >
                <LayoutGrid className="h-5 w-5" aria-hidden="true" />
                <TabLabel>Menu</TabLabel>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {sheetOpen ? <MobileMenuSheet onClose={() => setMenuOpen(false)} /> : null}
    </>
  );
}

// The keyboard signal moved to lib/keyboard-viewport.ts (2026-08-16): the
// assistant page's viewport-locked column needs the same answer, and the
// local hook this file used to carry only detected Android's
// `resizes-content` shrink — on iOS the layout viewport never moves, so the
// keyboard went undetected here. The shared module measures both.
