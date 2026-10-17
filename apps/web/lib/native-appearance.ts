import { cssColorToHex, statusBarStyleFor, type Appearance } from '@urganize/native-bridge';

// What the Expo shell is told about the page, so the bars above and below the
// webview (the status bar, and the band over the phone's own buttons) match it
// instead of staying dark in light mode. See NativeAppearanceBridge.

/** The CSS variable that holds the page's ground colour, as "r g b". */
export const PAGE_GROUND_TOKEN = '--color-bg-base';

/**
 * The page's ground colour and the bar text that reads on it. The design token
 * wins over the computed background because a variable does not animate, and
 * a background read mid-transition would report a colour between two themes.
 * Null when neither can be read, so the shell keeps what it has.
 */
export function resolvePageAppearance(read: {
  token: string | null | undefined;
  computed: string | null | undefined;
  /** The boot frame's painted ground, when a boot loader is on screen. */
  bootGround?: string | null;
}): Appearance | null {
  const background =
    (read.bootGround ? cssColorToHex(read.bootGround) : null) ??
    (read.token ? cssColorToHex(read.token) : null) ?? (read.computed ? cssColorToHex(read.computed) : null);
  if (!background) return null;
  return { background, statusBar: statusBarStyleFor(background) };
}

/** Reads the live page. Null on the server. */
export function readPageAppearance(): Appearance | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const token = window.getComputedStyle(document.documentElement).getPropertyValue(PAGE_GROUND_TOKEN);
  const computed = document.body ? window.getComputedStyle(document.body).backgroundColor : null;
  return resolvePageAppearance({ token, computed, bootGround: readBootGround() });
}

/**
 * Same string as BOOT_LOADER_EVENT in packages/ui/src/LoadingScreen.tsx (kept
 * as a literal so the app-wide bridge does not import the loader; a test holds
 * the two equal). Fired when a boot loader mounts or unmounts.
 */
export const BOOT_LOADER_EVENT = 'urganize:boot-loader';

/**
 * While a boot loader (LoadingScreen) is on screen, the bars report ITS
 * ground, not the page's: inside the phone app that frame is painted the
 * launch screen's colour, which can differ from the theme's (older shells),
 * and bars in another shade would draw two bands across the loading screen.
 * A loader hidden by CSS (the /auth pre-hydration copy) does not count.
 */
function readBootGround(): string | null {
  const loaders = document.querySelectorAll<HTMLElement>('[data-boot-loader]');
  for (const loader of Array.from(loaders)) {
    if (loader.getClientRects().length === 0) continue;
    return window.getComputedStyle(loader).backgroundColor || null;
  }
  return null;
}
