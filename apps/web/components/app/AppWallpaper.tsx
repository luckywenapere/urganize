'use client';

// The theme and the wallpaper (#1320; the rule is lib/appearance.ts).
//
//  - AppearanceWatcher: mounted once by AppShell on every page. Keeps the theme
//    and the picture right while a page stays open (the clock, the device's
//    light or dark setting, another tab), and clears the boot script's
//    data-app-shell hint on a page no app frame claimed (a stale sign-in).
//  - AppWallpaperMark: mounted by the signed-in app's frames (WorkspaceFrame,
//    the admin hub). It marks <html> with data-app-shell, which is what lets
//    globals.css draw the picture. The boot script in app/layout.tsx sets the
//    same mark before the first paint, so the picture is there from frame one.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { isAppShellPath } from '@/lib/appearance';
import { watchAppearance } from '@/lib/appearance-client';

let marks = 0;

export function AppearanceWatcher() {
  const pathname = usePathname() ?? '';
  const signedOut = useAuthStore((state) => !state.isAuthenticated && !state.isLoading);
  useEffect(() => watchAppearance(), []);
  // The boot hint is only cleared when it is known to be wrong: a page that is
  // not an app page, or someone known to be signed out. A frame that mounts
  // late (its code still loading) keeps the picture rather than blinking it.
  useEffect(() => {
    if (marks === 0 && (!isAppShellPath(pathname) || signedOut)) {
      document.documentElement.removeAttribute('data-app-shell');
    }
  }, [pathname, signedOut]);
  return null;
}

export function AppWallpaperMark() {
  useEffect(() => {
    marks += 1;
    document.documentElement.setAttribute('data-app-shell', '1');
    return () => {
      marks = Math.max(0, marks - 1);
      if (marks === 0) document.documentElement.removeAttribute('data-app-shell');
    };
  }, []);
  return null;
}
