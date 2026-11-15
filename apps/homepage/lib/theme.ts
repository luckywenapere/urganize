// Mirrors the shape of apps/web/lib/theme.ts for consistency across the
// monorepo, adapted for the marketing site's own attribute and CSS var
// system. Two deliberate differences from apps/web's version:
//   - applyTheme only sets the dataset attribute — homepage's CSS keys off
//     `html[data-marketing-theme="..."]` exclusively, never a .dark/.light
//     class, so there's nothing for classList to do here.
//   - getSystemTheme is actually used as a fallback (see the pre-hydration
//     script in app/layout.tsx) — apps/web defines the same function but
//     never wires it into its own script, which defaults to dark instead.

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "urganize.theme";

export const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "light" || value === "dark";

export const readStoredTheme = (): ThemeMode | null => {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : null;
};

export const getSystemTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

// The wallpaper (#1325, the app's own pictures, founder approved the mock in
// docs/mocks/site-wallpaper). Both pictures are dark, so the site always draws
// its dark look on top of them, and the sun and moon button picks the picture
// instead: "light" is the forest, "dark" the night sky. With nothing chosen
// the visitor's clock decides, the way the app's Auto does: the forest from
// 05:00 to 17:59, the night sky the rest of the day. The pre-paint script in
// app/layout.tsx says the same in plain JavaScript; change both together.
export type SiteWallpaper = "forest" | "night-sky";

export const wallpaperForHour = (hour: number): SiteWallpaper =>
  hour >= 5 && hour < 18 ? "forest" : "night-sky";

export const wallpaperForTheme = (mode: ThemeMode): SiteWallpaper =>
  mode === "light" ? "forest" : "night-sky";

export const resolveInitialTheme = (): ThemeMode => {
  const stored = readStoredTheme();
  if (stored) return stored;
  if (typeof window === "undefined") return "dark";
  return wallpaperForHour(new Date().getHours()) === "forest" ? "light" : "dark";
};

export const applyTheme = (mode: ThemeMode) => {
  if (typeof window === "undefined") return;
  const root = window.document.documentElement;
  root.dataset.marketingTheme = "dark";
  root.dataset.siteWallpaper = wallpaperForTheme(mode);
};

export const persistTheme = (mode: ThemeMode) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
};
