// How the app looks: the theme and the wallpaper, from one choice (#1320,
// founder, 2026-11-15). The wallpaper is not picked on its own any more: the
// theme choice decides it.
//
//   Light   the light theme, always the day picture
//   Dark    the dark theme, always the night sky
//   Auto    (the default) the time on the person's own device:
//           05:00 to 11:59 day, 12:00 to 17:59 forest, 18:00 to 04:59 night sky
//   System  the device's light or dark setting: light is day, dark is night sky
//
// The shell's colours follow the picture: dark text on the bright day picture
// (light theme), light text on the forest and the night sky (dark theme).
//
// The picture shows behind every signed-in app page (html[data-app-shell]),
// at every width; never on sign-in, onboarding, the paywall or public pages.
//
// PURE. The boot script below is the same rule as a string, because it runs
// before React (app/layout.tsx); appearance.test.ts runs it against
// resolveAppearance for every input so the two cannot drift.

export const THEME_CHOICES = ['light', 'dark', 'auto', 'system'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type ShellTheme = 'light' | 'dark';
export type Wallpaper = 'day' | 'forest' | 'night-sky';

/** The same key the old Light / Dark / System toggle used, so a saved Light or
 *  Dark carries over. Nothing stored used to mean "follow the device"; it now
 *  means Auto. */
export const THEME_STORAGE_KEY = 'urganize.theme';

export const DEFAULT_THEME_CHOICE: ThemeChoice = 'auto';

export const WALLPAPER_IMAGE: Record<Wallpaper, string> = {
  day: '/images/wallpapers/day.webp',
  forest: '/images/wallpapers/forest.webp',
  'night-sky': '/images/wallpapers/night-sky.webp',
};

export const THEME_CHOICE_COPY: Record<ThemeChoice, { label: string; about: string }> = {
  light: { label: 'Light', about: 'Light, with a morning picture behind every page.' },
  dark: { label: 'Dark', about: 'Dark, with the night sky behind every page.' },
  auto: { label: 'Auto', about: 'Changes with the time of day: morning, afternoon, night.' },
  system: { label: 'System', about: 'Follows this device’s light or dark setting.' },
};

export function parseThemeChoice(value: unknown): ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value)
    ? (value as ThemeChoice)
    : DEFAULT_THEME_CHOICE;
}

/** The picture for an hour of the day (0 to 23, the device's own clock). */
export function wallpaperForHour(hour: number): Wallpaper {
  if (hour >= 5 && hour < 12) return 'day';
  if (hour >= 12 && hour < 18) return 'forest';
  return 'night-sky';
}

const THEME_FOR: Record<Wallpaper, ShellTheme> = { day: 'light', forest: 'dark', 'night-sky': 'dark' };

export function resolveAppearance(input: {
  choice: ThemeChoice;
  hour: number;
  systemLight: boolean;
}): { wallpaper: Wallpaper; theme: ShellTheme } {
  let wallpaper: Wallpaper;
  if (input.choice === 'light') wallpaper = 'day';
  else if (input.choice === 'dark') wallpaper = 'night-sky';
  else if (input.choice === 'system') wallpaper = input.systemLight ? 'day' : 'night-sky';
  else wallpaper = wallpaperForHour(input.hour);
  return { wallpaper, theme: THEME_FOR[wallpaper] };
}

/** The signed-in app's own pages: the workspace frame (/dashboard, /settings)
 *  and the admin hub. */
const APP_SHELL_PATH = /^\/(dashboard|settings|admin)(\/|$)/;

export function isAppShellPath(pathname: string): boolean {
  return APP_SHELL_PATH.test(pathname);
}

/**
 * Runs in <head> before the body paints, so the first frame already has the
 * right theme and picture (no flash). It sets data-theme and the theme class
 * (as the old theme script did), data-wallpaper, and data-app-shell on an app
 * page for someone the auth store last saw signed in. data-app-shell is only a
 * hint: AppWallpaperMark sets or clears it once React knows. Any failure
 * leaves the server's dark default.
 */
export const APPEARANCE_BOOT_SCRIPT = `
try {
  var root = document.documentElement;
  var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  var choice = stored === 'light' || stored === 'dark' || stored === 'system' || stored === 'auto' ? stored : 'auto';
  var wallpaper;
  if (choice === 'light') wallpaper = 'day';
  else if (choice === 'dark') wallpaper = 'night-sky';
  else if (choice === 'system') wallpaper = window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night-sky';
  else {
    var hour = new Date().getHours();
    wallpaper = hour >= 5 && hour < 12 ? 'day' : hour >= 12 && hour < 18 ? 'forest' : 'night-sky';
  }
  var theme = wallpaper === 'day' ? 'light' : 'dark';
  root.dataset.theme = theme;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  root.setAttribute('data-wallpaper', wallpaper);
  if (${APP_SHELL_PATH.toString()}.test(window.location.pathname)) {
    var auth = localStorage.getItem('urganize-auth');
    var parsed = auth ? JSON.parse(auth) : null;
    if (parsed && parsed.state && parsed.state.isAuthenticated === true) root.setAttribute('data-app-shell', '1');
  }
} catch (_) {}
`;
