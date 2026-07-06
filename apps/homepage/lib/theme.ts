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

export const resolveInitialTheme = (): ThemeMode => {
  return readStoredTheme() ?? getSystemTheme();
};

export const applyTheme = (mode: ThemeMode) => {
  if (typeof window === "undefined") return;
  window.document.documentElement.dataset.marketingTheme = mode;
};

export const persistTheme = (mode: ThemeMode) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
};
