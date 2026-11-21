'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AppearanceChoice } from '@/components/settings/AppearanceChoice';
import { ChevronLeft, ChevronRight, Inbox, LayoutDashboard, LogOut, UserCircle } from '@/components/icons';
import { SignInSheet } from './SignInSheet';
import { useMusicAccount } from './useMusicAccount';

const ROW =
  'motion-focus flex min-h-[56px] w-full items-center gap-3 border-b border-stroke-subtle px-1 py-2.5 text-left transition-colors hover:bg-bg-hover';

function RowBody({ icon, title, hint, accent = false }: { icon: ReactNode; title: string; hint?: string; accent?: boolean }) {
  return (
    <>
      <span aria-hidden="true" className={`flex-none ${accent ? 'text-brand' : 'text-content-secondary'}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-content-primary">{title}</span>
        {hint ? <span className="block text-xs text-content-secondary">{hint}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 flex-none text-content-secondary" aria-hidden="true" />
    </>
  );
}

/**
 * Settings for the music side. It is where the way into the rest of Urganize
 * lives: the Artist dashboard for teams, the pitches inbox for playlist owners,
 * and the account. A listener with no account sees Sign in and Appearance, and
 * the Artist dashboard row opens a sheet rather than a dead end.
 */
export function SettingsScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, hasTeam, hasPlaylists, logout } = useMusicAccount();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      router.replace('/music');
    }
  };

  return (
    <div>
      <Link
        href="/music/you"
        className="motion-focus -ml-1 mb-2 inline-flex min-h-[40px] items-center gap-1 rounded-lg px-1 text-sm font-medium text-content-secondary hover:text-content-primary"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> You
      </Link>
      <h1 className="text-xl font-semibold tracking-tight text-content-primary">Settings</h1>

      {!isAuthenticated && !isLoading ? (
        <Link
          href="/auth?next=/music"
          className="motion-focus motion-press mt-4 flex h-12 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
        >
          Sign in
        </Link>
      ) : null}

      <ul className="m-0 mt-4 list-none p-0">
        {/* A playlist owner with no team has no dashboard to open. */}
        {!isAuthenticated || hasTeam ? (
          <li>
            {hasTeam ? (
              <Link href="/dashboard" className={ROW}>
                <RowBody
                  accent
                  icon={<LayoutDashboard className="h-5 w-5" />}
                  title="Artist dashboard"
                  hint="Run your rollouts and upload songs"
                />
              </Link>
            ) : (
              <button type="button" onClick={() => setSheetOpen(true)} className={ROW}>
                <RowBody
                  accent
                  icon={<LayoutDashboard className="h-5 w-5" />}
                  title="Artist dashboard"
                  hint="For artists, managers and labels"
                />
              </button>
            )}
          </li>
        ) : null}

        {hasPlaylists ? (
          <li>
            <Link href="/curator" className={ROW}>
              <RowBody
                accent
                icon={<Inbox className="h-5 w-5" />}
                title="Playlist pitches"
                hint="Songs sent to your playlists"
              />
            </Link>
          </li>
        ) : null}

        {isAuthenticated ? (
          <li>
            <Link href="/settings" className={ROW}>
              <RowBody icon={<UserCircle className="h-5 w-5" />} title="Account" hint="Your details, team and billing" />
            </Link>
          </li>
        ) : null}
      </ul>

      <section aria-labelledby="music-appearance" className="mt-6">
        <h2 id="music-appearance" className="text-sm font-semibold text-content-primary">
          Appearance
        </h2>
        <AppearanceChoice className="mt-2" />
      </section>

      {isAuthenticated ? (
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="motion-focus motion-press mt-8 inline-flex min-h-[44px] items-center gap-2 rounded-lg px-1 text-sm font-medium text-content-secondary hover:text-content-primary disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      ) : null}

      {sheetOpen ? <SignInSheet onClose={() => setSheetOpen(false)} /> : null}
    </div>
  );
}
