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
