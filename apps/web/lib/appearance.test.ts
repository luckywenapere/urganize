import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_BOOT_SCRIPT,
  THEME_CHOICES,
  WALLPAPER_IMAGE,
  isAppShellPath,
  wallpaperForEveryone,
  parseThemeChoice,
  resolveAppearance,
  wallpaperForHour,
  type ThemeChoice,
} from './appearance';

describe('parseThemeChoice', () => {
  it('keeps Light and Dark for people who already chose them', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
  });
  it('keeps an explicit System and Auto', () => {
    expect(parseThemeChoice('system')).toBe('system');
    expect(parseThemeChoice('auto')).toBe('auto');
  });
  it('moves the old "nothing stored, follow the OS" default to Auto', () => {
    expect(parseThemeChoice(null)).toBe('auto');
    expect(parseThemeChoice(undefined)).toBe('auto');
    expect(parseThemeChoice('')).toBe('auto');
    expect(parseThemeChoice('sepia')).toBe('auto');
  });
});

describe('wallpaperForHour', () => {
  it('is the day picture from 05:00 to 11:59', () => {
    expect(wallpaperForHour(5)).toBe('day');
    expect(wallpaperForHour(8)).toBe('day');
    expect(wallpaperForHour(11)).toBe('day');
  });
  it('is the forest from 12:00 to 17:59', () => {
    expect(wallpaperForHour(12)).toBe('forest');
    expect(wallpaperForHour(15)).toBe('forest');
    expect(wallpaperForHour(17)).toBe('forest');
  });
  it('is the night sky from 18:00 to 04:59, across midnight', () => {
    expect(wallpaperForHour(18)).toBe('night-sky');
    expect(wallpaperForHour(23)).toBe('night-sky');
    expect(wallpaperForHour(0)).toBe('night-sky');
    expect(wallpaperForHour(4)).toBe('night-sky');
  });
  it('reads anything out of range as night, never throws', () => {
    expect(wallpaperForHour(Number.NaN)).toBe('night-sky');
    expect(wallpaperForHour(24)).toBe('night-sky');
    expect(wallpaperForHour(-1)).toBe('night-sky');
  });
});

describe('resolveAppearance', () => {
  it('Light is always the day picture in the light theme', () => {
    for (const hour of [0, 9, 14, 21]) {
      for (const systemLight of [true, false]) {
        expect(resolveAppearance({ choice: 'light', hour, systemLight })).toEqual({ wallpaper: 'day', theme: 'light' });
      }
    }
  });
  it('Dark is always the night sky in the dark theme', () => {
    for (const hour of [0, 9, 14, 21]) {
      expect(resolveAppearance({ choice: 'dark', hour, systemLight: true })).toEqual({ wallpaper: 'night-sky', theme: 'dark' });
    }
  });
  it('Auto follows the clock, and the shell follows the picture', () => {
    expect(resolveAppearance({ choice: 'auto', hour: 7, systemLight: false })).toEqual({ wallpaper: 'day', theme: 'light' });
    expect(resolveAppearance({ choice: 'auto', hour: 13, systemLight: true })).toEqual({ wallpaper: 'forest', theme: 'dark' });
    expect(resolveAppearance({ choice: 'auto', hour: 22, systemLight: true })).toEqual({ wallpaper: 'night-sky', theme: 'dark' });
    expect(resolveAppearance({ choice: 'auto', hour: 4, systemLight: true })).toEqual({ wallpaper: 'night-sky', theme: 'dark' });
  });
  it('System follows the device setting, whatever the hour', () => {
    expect(resolveAppearance({ choice: 'system', hour: 22, systemLight: true })).toEqual({ wallpaper: 'day', theme: 'light' });
    expect(resolveAppearance({ choice: 'system', hour: 9, systemLight: false })).toEqual({ wallpaper: 'night-sky', theme: 'dark' });
  });
});

describe('wallpaperForEveryone', () => {
  it('is true on Urganize Music only', () => {
    for (const path of ['/music', '/music/collection', '/music/search']) expect(wallpaperForEveryone(path)).toBe(true);
    for (const path of ['/', '/musical', '/dashboard', '/auth']) expect(wallpaperForEveryone(path)).toBe(false);
  });
});

describe('isAppShellPath', () => {
  it('is true for the signed-in app', () => {
    for (const path of ['/dashboard', '/dashboard/urgans', '/dashboard/account', '/settings', '/admin', '/admin/teams']) {
      expect(isAppShellPath(path)).toBe(true);
    }
  });
  it('is false for sign-in, onboarding, the paywall and public pages', () => {
    for (const path of ['/', '/auth', '/onboarding', '/locked', '/add-card', '/k/abc', '/r/x', '/brief/invite/t', '/dashboards', '/administer']) {
      expect(isAppShellPath(path)).toBe(false);
    }
  });
});

it('every picture has a file', () => {
  expect(Object.keys(WALLPAPER_IMAGE).sort()).toEqual(['day', 'forest', 'night-sky']);
});

// The boot script in app/layout.tsx is a string (it runs before React). It
// must give exactly the answer resolveAppearance gives, for every input.
describe('APPEARANCE_BOOT_SCRIPT', () => {
  type Root = {
    dataset: Record<string, string>;
    attrs: Record<string, string>;
    classes: Set<string>;
  };
  function run(input: { stored: string | null; hour: number; systemLight: boolean; path: string; signedIn: boolean }) {
    const root: Root = { dataset: {}, attrs: {}, classes: new Set(['dark']) };
    const element = {
      dataset: root.dataset,
      classList: {
        remove: (...names: string[]) => names.forEach((n) => root.classes.delete(n)),
        add: (name: string) => root.classes.add(name),
      },
      setAttribute: (name: string, value: string) => {
        root.attrs[name] = value;
      },
      removeAttribute: (name: string) => {
        delete root.attrs[name];
      },
    };
    const storage: Record<string, string> = {};
    if (input.stored !== null) storage['urganize.theme'] = input.stored;
    if (input.signedIn) storage['urganize-auth'] = JSON.stringify({ state: { isAuthenticated: true } });
    class FakeDate {
      getHours() {
        return input.hour;
      }
    }
    const window = {
      location: { pathname: input.path },
      matchMedia: (q: string) => ({ matches: q.includes('light') ? input.systemLight : !input.systemLight }),
    };
    const fn = new Function('window', 'document', 'localStorage', 'Date', APPEARANCE_BOOT_SCRIPT);
    fn(window, { documentElement: element }, { getItem: (k: string) => storage[k] ?? null }, FakeDate);
    return root;
  }

  const stored: Array<string | null> = [null, ...THEME_CHOICES];
  for (const value of stored) {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const systemLight of [true, false]) {
        it(`matches the rule for ${value ?? 'nothing stored'} at ${hour}:00, system ${systemLight ? 'light' : 'dark'}`, () => {
          const expected = resolveAppearance({ choice: parseThemeChoice(value) as ThemeChoice, hour, systemLight });
          const root = run({ stored: value, hour, systemLight, path: '/dashboard', signedIn: true });
          expect(root.dataset.theme).toBe(expected.theme);
          expect([...root.classes]).toEqual([expected.theme]);
          expect(root.attrs['data-wallpaper']).toBe(expected.wallpaper);
          expect(root.attrs['data-app-shell']).toBe('1');
        });
      }
    }
  }

  it('marks the app shell only on app pages for someone signed in', () => {
    expect(run({ stored: null, hour: 9, systemLight: true, path: '/auth', signedIn: true }).attrs['data-app-shell']).toBeUndefined();
    expect(run({ stored: null, hour: 9, systemLight: true, path: '/dashboard', signedIn: false }).attrs['data-app-shell']).toBeUndefined();
    // The theme still applies everywhere.
    expect(run({ stored: null, hour: 14, systemLight: true, path: '/auth', signedIn: false }).dataset.theme).toBe('dark');
  });

  it('marks Urganize Music for everyone, signed in or not (#1364)', () => {
    for (const path of ['/music', '/music/collection', '/music/search']) {
      expect(run({ stored: null, hour: 9, systemLight: true, path, signedIn: false }).attrs['data-app-shell']).toBe('1');
    }
    expect(run({ stored: null, hour: 9, systemLight: true, path: '/musical', signedIn: false }).attrs['data-app-shell']).toBeUndefined();
  });
});
