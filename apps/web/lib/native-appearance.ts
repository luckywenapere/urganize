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
}): Appearance | null {
  const background = (read.token ? cssColorToHex(read.token) : null) ?? (read.computed ? cssColorToHex(read.computed) : null);
  if (!background) return null;
  return { background, statusBar: statusBarStyleFor(background) };
}

/** Reads the live page. Null on the server. */
export function readPageAppearance(): Appearance | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const token = window.getComputedStyle(document.documentElement).getPropertyValue(PAGE_GROUND_TOKEN);
  const computed = document.body ? window.getComputedStyle(document.body).backgroundColor : null;
  return resolvePageAppearance({ token, computed });
}
