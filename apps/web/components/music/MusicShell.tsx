'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Inbox, LayoutDashboard, Music, Search, Settings, UserCircle } from '@/components/icons';
import { MusicProvider } from './MusicProvider';
import { PlayerBar } from './PlayerBar';
import { useMusicAccount } from './useMusicAccount';

// Songs, then the listener's own tab, then Search. Settings is not a tab: it
// sits behind the gear on You (and under the menu on a laptop), so the bar is
// about listening and the personal corner.
const TABS = [
  { href: '/music', label: 'Songs', Icon: Music, exact: true },
  { href: '/music/you', label: 'You', Icon: UserCircle, exact: false },
  { href: '/music/search', label: 'Search', Icon: Search, exact: false },
] as const;

function isActive(pathname: string | null, href: string, exact: boolean): boolean {
  if (!pathname) return false;
  // Settings belongs to You, so You stays lit there.
  if (href === '/music/you' && pathname.startsWith('/music/settings')) return true;
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** The buttons that lead back to the rest of Urganize, for whoever has a team or
 *  playlists. Shared by the laptop's side menu and the phone's page header. */
export function MusicShortcuts({ className = '' }: { className?: string }) {
  const { hasTeam, hasPlaylists } = useMusicAccount();
  if (!hasTeam && !hasPlaylists) return null;
  const pill =
    'motion-focus motion-press inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-brand px-3 text-xs font-semibold text-brand transition-colors hover:bg-brand/10';
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {hasTeam ? (
        <Link href="/dashboard" className={pill}>
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" /> Dashboard
        </Link>
      ) : null}
      {hasPlaylists ? (
        <Link href="/curator" className={pill}>
          <Inbox className="h-3.5 w-3.5" aria-hidden="true" /> Pitches
        </Link>
      ) : null}
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { hasTeam, hasPlaylists } = useMusicAccount();

  return (
    <div className="min-h-dvh text-content-primary lg:flex">
      {/* Laptop: the three tabs down the left, the way back to the dashboard under them, Settings at the bottom. */}
      <aside className="sticky top-0 hidden h-dvh w-[220px] flex-none flex-col border-r border-stroke-default bg-bg-surface px-3 py-5 lg:flex">
        <p className="px-3 text-base font-semibold tracking-tight">Urganize</p>
        <nav aria-label="Music" className="mt-5 flex flex-col gap-1">
          {TABS.map(({ href, label, Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`motion-focus flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors ${
                  active ? 'bg-brand/10 text-brand' : 'text-content-primary hover:bg-bg-hover'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        {hasTeam || hasPlaylists ? (
          <div className="mt-6 border-t border-stroke-default px-1 pt-4">
            <MusicShortcuts className="flex-col items-stretch [&>a]:justify-center" />
          </div>
        ) : null}
        <Link
          href="/music/settings"
          aria-current={pathname?.startsWith('/music/settings') ? 'page' : undefined}
          className={`motion-focus mt-auto flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors ${
            pathname?.startsWith('/music/settings')
              ? 'bg-brand/10 text-brand'
              : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
          }`}
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
      </aside>

      <div className="min-w-0 flex-1">
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-3xl px-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))] pt-5 focus:outline-none lg:px-8 lg:pb-32 lg:pt-8"
        >
          {children}
        </main>
      </div>

      <PlayerBar />

      {/* Phone: the three tabs along the bottom. */}
      <nav
        aria-label="Music"
        className="fixed inset-x-0 bottom-0 z-[70] border-t border-stroke-default bg-bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="m-0 flex list-none p-0">
          {TABS.map(({ href, label, Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`motion-focus flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                    active ? 'text-brand' : 'text-content-secondary'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function MusicShell({ children }: { children: ReactNode }) {
  return (
    <MusicProvider>
      <Frame>{children}</Frame>
    </MusicProvider>
  );
}
