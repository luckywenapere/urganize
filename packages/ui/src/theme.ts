export type ThemeMode = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'urganize.theme';

export const isThemeMode = (value: unknown): value is ThemeMode => value === 'dark' || value === 'light';

export const readStoredTheme = (): ThemeMode | null => {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : null;
};

export const getSystemTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export const resolveInitialTheme = (): ThemeMode => {
  return readStoredTheme() || getSystemTheme();
};

export const applyTheme = (mode: ThemeMode) => {
  if (typeof window === 'undefined') return;
  const root = window.document.documentElement;
  root.dataset.theme = mode;
  root.classList.remove('dark', 'light');
  root.classList.add(mode);
};

export const persistTheme = (mode: ThemeMode) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
};

/** Selecting "System" clears the stored preference — an absent key IS the
 * system setting (the pre-hydration boot script in the app's layout already
 * falls back to prefers-color-scheme when nothing is stored). */
export const clearStoredTheme = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(THEME_STORAGE_KEY);
};

export type ThemePreference = ThemeMode | 'system';

export const readStoredPreference = (): ThemePreference => {
  return readStoredTheme() ?? 'system';
};
