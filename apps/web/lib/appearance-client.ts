'use client';

// The browser half of lib/appearance.ts (#1320): read and save the theme
// choice, and put the theme and the picture on <html>. The rule itself is
// pure and tested there.

import {
  THEME_STORAGE_KEY,
  WALLPAPER_IMAGE,
  parseThemeChoice,
  resolveAppearance,
  type ThemeChoice,
  type Wallpaper,
} from './appearance';

/** Fired on window when the choice changes in this tab. */
export const APPEARANCE_CHANGE_EVENT = 'urganize:appearance';

export function readThemeChoice(): ThemeChoice {
  try {
    return parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return parseThemeChoice(null);
  }
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies until the page is closed.
  }
  applyAppearance(choice);
  window.dispatchEvent(new Event(APPEARANCE_CHANGE_EVENT));
}

function systemLight(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

function setOnRoot(theme: 'light' | 'dark', wallpaper: Wallpaper) {
  const root = document.documentElement;
  if (root.dataset.theme !== theme) {
    root.dataset.theme = theme;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
  }
  if (root.getAttribute('data-wallpaper') !== wallpaper) root.setAttribute('data-wallpaper', wallpaper);
}

let pending = 0;

/**
 * Applies the choice now. When the picture changes on a page already on screen
 * (the clock passed a boundary), the new picture is loaded first and the swap
 * happens once it is ready, so the page never shows a blank ground in between.
 * A choice made by the person applies at once.
 */
export function applyAppearance(choice: ThemeChoice = readThemeChoice(), options: { preload?: boolean } = {}): void {
  if (typeof document === 'undefined') return;
  const next = resolveAppearance({ choice, hour: new Date().getHours(), systemLight: systemLight() });
  const current = document.documentElement.getAttribute('data-wallpaper');
  const ticket = ++pending;
  if (!options.preload || current === next.wallpaper) {
    setOnRoot(next.theme, next.wallpaper);
    return;
  }
  const image = new Image();
  const swap = () => {
    if (ticket === pending) setOnRoot(next.theme, next.wallpaper);
  };
  image.onload = swap;
  image.onerror = swap;
  image.src = WALLPAPER_IMAGE[next.wallpaper];
}

/**
 * Keeps a page that stays open right: every minute, when the tab comes back
 * into view, when the device's light or dark setting changes, and when the
 * choice changes here or in another tab. Returns the stop function.
 */
export function watchAppearance(): () => void {
  const refresh = () => applyAppearance(readThemeChoice(), { preload: true });
  const onVisible = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) applyAppearance(readThemeChoice());
  };
  const timer = window.setInterval(refresh, 60_000);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('storage', onStorage);
  let media: MediaQueryList | null = null;
  try {
    media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener?.('change', refresh);
  } catch {
    media = null;
  }
  applyAppearance();
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('storage', onStorage);
    media?.removeEventListener?.('change', refresh);
  };
}
