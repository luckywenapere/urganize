'use client';

// The frame every /curator page renders inside. Deliberately tiny: a top bar
// with the mark and a sign-out control, a bottom tab row, and nothing else. A
// playlist owner opens this to answer three pitches and close it again, so the
// chrome should stay out of the way.
//
// It also holds the access rules in ONE place, so no page repeats them:
//   flag off        -> the marketing site
//   not signed in   -> /auth with a next back to here
//   not a curator   -> that account's own home
//
// AppShell adds /curator to its standalone-route list, so none of the team
// chrome (topbar, identity card, UrgAns rail, dock) renders around this.

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { Inbox, ListMusic, LogOut, UserCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { HOME_PATH } from '@/lib/home-path';

const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

const TABS = [
  { href: '/curator', label: 'Pitches', icon: Inbox },
  { href: '/curator/playlists', label: 'Playlists', icon: ListMusic },
  { href: '/curator/profile', label: 'Profile', icon: UserCircle },
] as const;

export function CuratorShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (!PITCHING_ENABLED) {
      router.replace('/');
      return;
    }
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      router.replace(`/auth?next=${encodeURIComponent(pathname || '/curator')}`);
      return;
    }
    if (user && user.role !== 'curator') {
      router.replace(HOME_PATH);
    }
  }, [isAuthLoading, isAuthenticated, pathname, router, user]);

  if (!PITCHING_ENABLED) return null;

  const isCurator = isAuthenticated && user?.role === 'curator';

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="sticky top-0 z-30 border-b border-stroke-default bg-bg-base/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size="sm" />
            <span className="truncate text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
              Playlist owner
            </span>
          </div>
          {isCurator ? (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stroke-default px-3 text-xs font-semibold text-content-secondary transition-colors hover:border-stroke-strong hover:text-content-primary"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      {/* pb clears the fixed tab row on small screens. */}
      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:pb-10">
        {isCurator || isAuthLoading ? children : null}
      </main>

      {isCurator ? (
        <nav
          aria-label="Playlist owner sections"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-stroke-default bg-bg-surface/95 backdrop-blur sm:static sm:mx-auto sm:mb-8 sm:max-w-3xl sm:rounded-xl sm:border"
        >
          <ul className="mx-auto flex w-full max-w-3xl">
            {TABS.map((tab) => {
              const isActive =
                tab.href === '/curator' ? pathname === '/curator' : pathname?.startsWith(tab.href);
              const Icon = tab.icon;
              return (
                <li key={tab.href} className="flex-1">
                  <Link
                    href={tab.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors sm:h-12 sm:flex-row sm:gap-2 sm:text-xs ${
                      isActive
                        ? 'text-brand'
                        : 'text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
