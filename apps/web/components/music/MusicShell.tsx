'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Logo } from '@urganize/ui';
import { AppWallpaperMark } from '@/components/app/AppWallpaper';
import { Search, UserRoundCog } from '@/components/icons/lucide';
import { MUSIC_TABS, musicTabForPath, musicSwipeTarget } from '@/lib/music/nav';
import { MusicMenuSheet } from './MusicMenuSheet';
import { MusicProvider } from './MusicProvider';
import { MusicUploadSheet } from './MusicUploadSheet';
import { PlayerBar } from './PlayerBar';
import { useMusicAccount } from './useMusicAccount';

type Sheet = 'menu' | 'upload' | null;

const SheetsContext = createContext<{ open: (sheet: Exclude<Sheet, null>) => void }>({ open: () => undefined });

/** Opens the circle menu or the upload sheet from anywhere on the music side. */
export function useMusicSheets() {
  return useContext(SheetsContext);
}

const CIRCLE =
  'motion-focus motion-press flex h-9 w-9 items-center justify-center rounded-full border border-content-primary/[0.16] bg-bg-surface/70 text-content-primary backdrop-blur transition-colors hover:bg-content-primary/[0.06] md:h-10 md:w-10';

/**
 * The music side's frame (#1364, docs/mocks/music-v2), in the dashboard's
 * shape so the two sides feel like one app: the Urganize mark and "Music" at
 * the top left, two tabs (Home and Collection) with the green underline,
 * search and the circle menu at the right. On a phone you swipe between the
 * tabs; from md the mark sits left and the tabs in the middle. The dashboard's
 * wallpaper shows here for everyone, signed in or not.
 */
function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/music';
  const router = useRouter();
  const tab = musicTabForPath(pathname);
  const [sheet, setSheet] = useState<Sheet>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const open = useCallback((next: Exclude<Sheet, null>) => setSheet(next), []);
  const sheets = useMemo(() => ({ open }), [open]);

  // Prefetch the other tab so a swipe lands at once.
  useEffect(() => {
    for (const item of MUSIC_TABS) router.prefetch(item.href);
  }, [router]);

  const onTouchStart = (event: React.TouchEvent) => {
    const point = event.touches[0];
    touch.current = point ? { x: point.clientX, y: point.clientY } : null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    const point = event.changedTouches[0];
    if (!start || !point) return;
    // A swipe only counts when it is clearly sideways and long enough; a
    // scroll, a tap or a drag on a slider never changes the tab.
    if ((event.target as HTMLElement | null)?.closest('input,textarea,[data-no-swipe]')) return;
    const target = musicSwipeTarget(tab, point.clientX - start.x, point.clientY - start.y);
    if (target) router.push(target);
  };

  return (
    <SheetsContext.Provider value={sheets}>
      <AppWallpaperMark />
      <div className="min-h-dvh text-content-primary">
        <header className="sticky top-0 z-40 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md md:border-b md:border-content-primary/[0.06]">
          <div className="relative flex h-[52px] items-center px-5 md:h-[72px] md:px-8">
            <Link href="/music" aria-label="Urganize Music Beta, Home" className="motion-focus flex items-center gap-2 rounded-md">
              <Logo size="sm" priority />
              <span className="text-[17px] font-semibold tracking-[-0.02em] text-content-secondary md:text-[19px]">Music</span>
              {/* Same Beta pill as the workspace's top bar (#1386). */}
              <span className="select-none rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                Beta
              </span>
            </Link>
            <nav
              aria-label="Music"
              className="hidden h-full items-center md:absolute md:inset-y-0 md:left-1/2 md:flex md:-translate-x-1/2"
            >
              <TabRow tab={tab} />
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/music/search"
                aria-label="Search"
                aria-current={pathname.startsWith('/music/search') ? 'page' : undefined}
                className={`${CIRCLE} ${pathname.startsWith('/music/search') ? 'border-brand text-brand' : ''}`}
              >
                <Search className="h-[18px] w-[18px]" aria-hidden="true" />
              </Link>
              <button type="button" onClick={() => setSheet('menu')} aria-label="Menu" aria-haspopup="dialog" className={CIRCLE}>
                <UserRoundCog className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </div>
          </div>
          {tab ? (
            <nav aria-label="Music" className="flex h-11 items-center px-5 md:hidden">
              <TabRow tab={tab} />
            </nav>
          ) : null}
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          onTouchStart={tab ? onTouchStart : undefined}
          onTouchEnd={tab ? onTouchEnd : undefined}
          className="mx-auto w-full max-w-6xl px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 focus:outline-none md:px-8 md:pb-28 md:pt-7 lg:px-14"
        >
          {children}
        </main>

        <PlayerBar />
      </div>

      <Suspense fallback={null}>
        <UploadFromLink onOpen={open} />
      </Suspense>
      {sheet === 'menu' ? <MusicMenuSheet onClose={() => setSheet(null)} onUpload={() => setSheet('upload')} /> : null}
      {sheet === 'upload' ? <MusicUploadSheet onClose={() => setSheet(null)} /> : null}
    </SheetsContext.Provider>
  );
}

/** Home and Collection, 17px semibold, the inactive one at 45%, a 2.5px green
 *  underline under the one you are on. The dashboard's tab style. */
function TabRow({ tab }: { tab: ReturnType<typeof musicTabForPath> }) {
  return (
    <ul className="m-0 flex h-full list-none items-center gap-6 p-0 md:gap-14">
      {MUSIC_TABS.map((item) => {
        const active = tab === item.key;
        return (
          <li key={item.key} className="h-full">
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="motion-focus relative flex h-full items-center text-[17px] font-semibold md:text-[19px]"
            >
              <span className={`text-content-primary transition-opacity ${active ? '' : 'opacity-45'}`}>{item.label}</span>
              {active ? (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-1 h-[2.5px] rounded-full bg-brand md:bottom-2.5" />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** /music?upload=1 (the Upload tile on dashboard Home) opens the upload sheet
 *  for someone with a team, and the circle menu (with Sign in) otherwise. */
function UploadFromLink({ onOpen }: { onOpen: (sheet: 'menu' | 'upload') => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, isLoading, hasTeam } = useMusicAccount();
  const wanted = params?.get('upload') === '1';
  useEffect(() => {
    if (!wanted || isLoading) return;
    onOpen(isAuthenticated && hasTeam ? 'upload' : 'menu');
    router.replace('/music', { scroll: false });
  }, [wanted, isLoading, isAuthenticated, hasTeam, onOpen, router]);
  return null;
}

export function MusicShell({ children }: { children: ReactNode }) {
  return (
    <MusicProvider>
      <Frame>{children}</Frame>
    </MusicProvider>
  );
}
