import { Capacitor } from '@capacitor/core';

/**
 * Thin wrapper around @capacitor/core so the rest of the app never imports
 * Capacitor directly. On the web (no native shell), Capacitor.isNativePlatform()
 * always returns false and getPlatform() always returns 'web' — these are safe
 * to call unconditionally in both server and client code paths, but they only
 * mean anything client-side, so callers should gate on 'use client' contexts.
 */
export type NativePlatform = 'ios' | 'android' | 'web';

export function getPlatform(): NativePlatform {
  if (typeof window === 'undefined') return 'web';
  return Capacitor.getPlatform() as NativePlatform;
}

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
}

export function isIOSApp(): boolean {
  return isNativePlatform() && getPlatform() === 'ios';
}

export function isAndroidApp(): boolean {
  return isNativePlatform() && getPlatform() === 'android';
}

/**
 * True only for a plain Android browser tab — Capacitor's getPlatform()
 * reports 'web' outside the native shell, so it can't distinguish "Android
 * Chrome" from any other browser. This is a UA sniff specifically for
 * steering mobile-web visitors toward the installed app; it is deliberately
 * never true inside the native shell itself (isAndroidApp() covers that).
 */
export function isAndroidBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNativePlatform()) return false;
  return /Android/i.test(window.navigator.userAgent);
}

/**
 * True only for a plain iOS browser tab — the mirror of isAndroidBrowser(),
 * and used for the same job: steering a mobile-web visitor toward an
 * installed app. Never true inside the Capacitor native shell.
 *
 * iPadOS 13+ is the reason this is not a one-line UA test: it reports itself
 * as "Macintosh" specifically so sites stop serving it the phone layout, so
 * the only reliable tell is a Mac platform string with a touch screen —
 * desktop Safari reports maxTouchPoints 0.
 */
export function isIOSBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNativePlatform()) return false;
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
 * the Capacitor shell", this asks "did the user add us to their Home Screen".
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
