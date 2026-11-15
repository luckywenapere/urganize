import { describe, expect, it } from 'vitest';
import {
  HOME_WALLPAPERS,
  HOME_WALLPAPER_COPY,
  HOME_WALLPAPER_IMAGE,
  hasPickedWallpaper,
  parseHomeWallpaper,
  showWallpaperButton,
  wallpaperAttr,
  wallpaperUpdate,
} from './wallpaper';

describe('Home wallpaper value', () => {
  it('offers None, Forest and Night sky, in that order', () => {
    expect([...HOME_WALLPAPERS]).toEqual(['none', 'forest', 'night_sky']);
    expect(HOME_WALLPAPERS.map((id) => HOME_WALLPAPER_COPY.options[id])).toEqual(['None', 'Forest', 'Night sky']);
  });

  it('reads a saved value and falls back to None for anything else', () => {
    expect(parseHomeWallpaper('forest')).toBe('forest');
    expect(parseHomeWallpaper('night_sky')).toBe('night_sky');
    expect(parseHomeWallpaper('none')).toBe('none');
    for (const bad of [undefined, null, '', 'Forest', 'beach', 3, {}, ['forest']]) {
      expect(parseHomeWallpaper(bad)).toBe('none');
    }
  });

  it('has a picture for each wallpaper and none for None', () => {
    expect(HOME_WALLPAPER_IMAGE.forest).toBe('/images/wallpapers/forest.webp');
    expect(HOME_WALLPAPER_IMAGE.night_sky).toBe('/images/wallpapers/night-sky.webp');
    expect(wallpaperAttr('none')).toBeNull();
    expect(wallpaperAttr('forest')).toBe('forest');
    expect(wallpaperAttr('night_sky')).toBe('night-sky');
  });
});

describe('The wallpaper button on Home', () => {
  it('shows until the person first sets a wallpaper', () => {
    expect(showWallpaperButton({ home_wallpaper: 'none', home_wallpaper_set_at: null })).toBe(true);
    expect(showWallpaperButton({})).toBe(true);
  });

  it('is gone once a wallpaper is set', () => {
    expect(showWallpaperButton({ home_wallpaper: 'forest', home_wallpaper_set_at: '2026-11-15T10:00:00Z' })).toBe(false);
    // The picture alone is enough, should the date be missing.
    expect(showWallpaperButton({ home_wallpaper: 'night_sky' })).toBe(false);
  });

  it('stays gone after going back to None', () => {
    const profile = { home_wallpaper: 'none', home_wallpaper_set_at: '2026-11-15T10:00:00Z' };
    expect(hasPickedWallpaper(profile)).toBe(true);
    expect(showWallpaperButton(profile)).toBe(false);
  });

  it('is hidden while there is no profile to read', () => {
    expect(showWallpaperButton(null)).toBe(false);
    expect(showWallpaperButton(undefined)).toBe(false);
  });
});

describe('Saving a wallpaper', () => {
  const NOW = '2026-11-15T12:00:00.000Z';

  it('stamps the first time a picture is set', () => {
    expect(wallpaperUpdate('forest', { home_wallpaper: 'none', home_wallpaper_set_at: null }, NOW)).toEqual({
      home_wallpaper: 'forest',
      home_wallpaper_set_at: NOW,
    });
  });

  it('keeps the first stamp on later changes', () => {
    const profile = { home_wallpaper: 'forest', home_wallpaper_set_at: '2026-11-01T00:00:00Z' };
    expect(wallpaperUpdate('night_sky', profile, NOW)).toEqual({ home_wallpaper: 'night_sky' });
    expect(wallpaperUpdate('none', profile, NOW)).toEqual({ home_wallpaper: 'none' });
  });

  it('does not stamp for None on a person who never picked', () => {
    expect(wallpaperUpdate('none', { home_wallpaper: 'none', home_wallpaper_set_at: null }, NOW)).toEqual({
      home_wallpaper: 'none',
    });
  });
});
