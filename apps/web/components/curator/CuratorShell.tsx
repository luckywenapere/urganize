'use client';

// The frame every /curator page renders inside. Deliberately tiny: a top bar
// with the mark and a sign-out control, a bottom tab row, and nothing else. A
// playlist owner opens this to answer three pitches and close it again, so the
// chrome should stay out of the way.
//
// It also holds the access rules in ONE place, so no page repeats them:
//   flag off           -> the marketing site
//   not signed in      -> /auth with a next back to here
//   no curator profile -> that account's own home
//
// The gate is the curator_profiles row (hasCuratorProfile), not profiles.role:
// an account can own playlists AND run releases, and such a dual account has a
// team role here. While the capability is still unknown (null) we wait rather
// than bounce, or a dual account would be thrown out of its own inbox on load.
//
// AppShell adds /curator to its standalone-route list, so none of the team
// chrome (topbar, identity card, UrgAns rail, dock) renders around this.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@urganize/ui';
import { Inbox, ListMusic, LayoutGrid, LogOut, UserCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
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
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const logout = useAuthStore((state) => state.logout);

  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState('');

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
    if (hasCuratorProfile === false) {
      router.replace(HOME_PATH);
    }
  }, [hasCuratorProfile, isAuthLoading, isAuthenticated, pathname, router]);

  if (!PITCHING_ENABLED) return null;

  const isCurator = isAuthenticated && hasCuratorProfile === true;
  // role 'curator' means the team side was never switched on. Everyone else here
  // already has a workspace waiting, so they get a plain link to it.
  const isCuratorOnly = isCurator && user?.role === 'curator';

  // Turns the team side on for a playlist owner who also wants to run releases:
  // clears the curator-only marker, then lands them in the workspace. The
  // workspace itself is provisioned lazily by the first request that needs it.
  const handleActivateTeam = async () => {
    setActivationError('');
    setIsActivating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Sign in again to set this up.');

      const response = await fetch('/api/curator/activate-team', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not set up your workspace.');
      }

      // Force: the role just changed server-side, so the recency guard has to be
      // skipped or the app would still route this account back here.
      await checkAuth({ force: true });
      router.push(HOME_PATH);
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : 'Could not set up your workspace.');
      setIsActivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="sticky top-0 z-30 border-b border-stroke-default bg-bg-base/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
          {/* The eyebrow is the first thing to go below `sm`: with a dual
              account the right side carries two pills, and logo + eyebrow +
              both pills measures ~396px against the 343px a 375px phone
              actually offers. The label is decoration; the two controls are
              not. */}
          <div className="flex min-w-0 items-center gap-3">
            <Logo size="sm" />
            <span className="hidden truncate text-[11px] uppercase tracking-[0.16em] text-content-tertiary sm:inline">
              Playlist owner
            </span>
          </div>
          {isCurator ? (
            <div className="flex items-center gap-2">
              {isCuratorOnly ? (
                <button
                  type="button"
                  onClick={() => void handleActivateTeam()}
                  disabled={isActivating}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand bg-brand/10 px-3 text-xs font-semibold text-brand transition-colors hover:bg-brand/20 disabled:opacity-60"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {isActivating ? 'Setting up…' : 'Run your releases'}
                </button>
              ) : (
                <Link
                  href={HOME_PATH}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stroke-default px-3 text-xs font-semibold text-content-secondary transition-colors hover:border-stroke-strong hover:text-content-primary"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Your workspace
                </Link>
              )}
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stroke-default px-3 text-xs font-semibold text-content-secondary transition-colors hover:border-stroke-strong hover:text-content-primary"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
        {activationError ? (
          <p
            role="status"
            className="mx-auto w-full max-w-3xl px-4 pb-2 text-xs text-status-error"
          >
            {activationError}
          </p>
        ) : null}
      </header>

      {/* pb clears the fixed tab row on small screens. */}
      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:pb-10">
        {isCurator || isAuthLoading || (isAuthenticated && hasCuratorProfile === null)
          ? children
          : null}
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
