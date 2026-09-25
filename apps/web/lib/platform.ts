import { hasShellUserAgent } from '@urganize/native-bridge';
import { getNativeShell } from '@/lib/native-bridge';

/**
 * Platform checks for the rest of the app, so nothing else reads the native
 * shell directly. "Native" means the Expo shell in apps/mobile, which shows
 * this website in a react-native-webview and describes itself through a
 * global injected before the page loads (lib/native-bridge.ts). In a browser
 * and on the server there is no such global, so getPlatform() is 'web' and
 * isNativePlatform() is false. Both answer synchronously, which the iOS
 * billing gates rely on to render correctly on the first paint.
 */
export type NativePlatform = 'ios' | 'android' | 'web';

export function getPlatform(): NativePlatform {
  return getNativeShell()?.platform ?? 'web';
}

export function isNativePlatform(): boolean {
  return getNativeShell() !== null;
}

export function isIOSApp(): boolean {
  return isNativePlatform() && getPlatform() === 'ios';
}

export function isAndroidApp(): boolean {
  return isNativePlatform() && getPlatform() === 'android';
}

/**
 * The Capacitor app this shell replaced (2026-09-25). It is still installed on
 * phones that took the APK from urganize.app/download, and it injects
 * window.Capacitor, which no browser tab has and nothing on this site defines.
 * It is NOT the Expo shell, so nothing here asks it for a native feature; this
 * only stops the two browser checks below from reading it as a phone browser,
 * which would offer to install the app inside the app. Delete it once no
 * installs of the Capacitor build remain.
 */
function isRetiredCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as Window & { Capacitor?: unknown }).Capacitor !== 'undefined';
}

/** Inside one of our apps, old or new, however late the new one describes itself. */
function isInsideAnApp(): boolean {
  return (
    isNativePlatform() ||
    isRetiredCapacitorApp() ||
    hasShellUserAgent(window.navigator?.userAgent)
  );
}

/**
 * True only for a plain Android browser tab — getPlatform() reports 'web'
 * outside the native shell, so it can't distinguish "Android Chrome" from
 * any other browser. This is a UA sniff specifically for
 * steering mobile-web visitors toward the installed app; it is deliberately
 * never true inside the native shell itself (isAndroidApp() covers that).
 *
 * The shell's user-agent token is checked as well as isNativePlatform():
 * Android injects the shell's description as the page starts loading, not
 * strictly before its first script, and in that gap the app would otherwise
 * read as a phone browser and offer to install itself. The retired Capacitor
 * app is checked for the same reason (isInsideAnApp).
 */
export function isAndroidBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  if (isInsideAnApp()) return false;
  return /Android/i.test(window.navigator.userAgent);
}

/**
 * True only for a plain iOS browser tab — the mirror of isAndroidBrowser(),
 * and used for the same job: steering a mobile-web visitor toward an
 * installed app. Never true inside the native shell.
 *
 * iPadOS 13+ is the reason this is not a one-line UA test: it reports itself
 * as "Macintosh" specifically so sites stop serving it the phone layout, so
 * the only reliable tell is a Mac platform string with a touch screen —
 * desktop Safari reports maxTouchPoints 0.
 */
export function isIOSBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  if (isInsideAnApp()) return false;
  const nav = window.navigator;
  if (/iPad|iPhone|iPod/i.test(nav.userAgent)) return true;
  return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
}

/**
 * Is this page running as an INSTALLED app rather than a browser tab?
 *
 * Two checks because the two platforms answer differently: `display-mode`
 * is the standard (Android/Chrome, and iOS 16.4+ Home Screen apps), while
 * `navigator.standalone` is the non-standard Safari property that has
 * reported this since long before the media query did. Either being true is
 * enough; matchMedia is guarded because it throws on an unsupported query
 * string in some older engines.
 *
 * NOT the same question as isNativePlatform(): that one asks "are we inside
 * the native shell", this asks "did the user add us to their Home Screen".
 */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  if (iosStandalone === true) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}
