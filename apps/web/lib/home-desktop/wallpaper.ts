// The wallpaper behind Home on a computer (#1305, part of #1175; founder
// approved docs/mocks/home-wallpaper): None, Forest or Night sky, saved on the
// person's own profiles row (home_wallpaper, home_wallpaper_set_at) so it
// follows them to any computer. The pure half, tested.

export const HOME_WALLPAPERS = ['none', 'forest', 'night_sky'] as const;
export type HomeWallpaper = (typeof HOME_WALLPAPERS)[number];

export const HOME_WALLPAPER_COPY = {
  title: 'Wallpaper',
  about: 'Pick what sits behind Home.',
  settingsAbout: 'Pick what sits behind Home on a computer. It is saved to your account.',
  button: 'Wallpaper',
  badge: 'New',
  failed: 'We could not save your wallpaper. Check your connection and try again.',
  options: { none: 'None', forest: 'Forest', night_sky: 'Night sky' } as Record<HomeWallpaper, string>,
} as const;

/** The picture for each wallpaper (apps/web/public/images/wallpapers). */
export const HOME_WALLPAPER_IMAGE: Record<Exclude<HomeWallpaper, 'none'>, string> = {
  forest: '/images/wallpapers/forest.webp',
  night_sky: '/images/wallpapers/night-sky.webp',
};

/** A saved value, or None for anything that is not one of the three. */
export function parseHomeWallpaper(value: unknown): HomeWallpaper {
  return typeof value === 'string' && (HOME_WALLPAPERS as readonly string[]).includes(value)
    ? (value as HomeWallpaper)
    : 'none';
}

/** The value of html[data-home-wallpaper] that globals.css styles, or null. */
export function wallpaperAttr(wallpaper: HomeWallpaper): string | null {
  return wallpaper === 'none' ? null : wallpaper.replace('_', '-');
}

type WallpaperProfile = { home_wallpaper?: unknown; home_wallpaper_set_at?: string | null };

/** True once the person has set a picture, even if they are back on None. */
export function hasPickedWallpaper(profile: WallpaperProfile | null | undefined): boolean {
  if (!profile) return false;
  return Boolean(profile.home_wallpaper_set_at) || parseHomeWallpaper(profile.home_wallpaper) !== 'none';
}

/**
 * The button on Home is there to be noticed once. It goes for good the first
 * time a picture is set; after that the choice lives in Settings and in
 * Customise Home. With no profile to read it stays hidden, so it never flashes.
 */
export function showWallpaperButton(profile: WallpaperProfile | null | undefined): boolean {
  return Boolean(profile) && !hasPickedWallpaper(profile);
}

/** What to write to the profiles row. The first picture stamps the date, once. */
export function wallpaperUpdate(
  next: HomeWallpaper,
  profile: WallpaperProfile | null | undefined,
  nowIso: string
): { home_wallpaper: HomeWallpaper; home_wallpaper_set_at?: string } {
  if (next !== 'none' && !profile?.home_wallpaper_set_at) {
    return { home_wallpaper: next, home_wallpaper_set_at: nowIso };
  }
  return { home_wallpaper: next };
}
