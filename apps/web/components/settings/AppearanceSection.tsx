'use client';

import { ThemeToggle } from '@urganize/ui';
import { panelClass } from './panelClass';
import { InfoTip } from '@/components/shared/HelpTip';
import { HomeWallpaperChoice } from '@/components/home-desktop/HomeWallpaper';
import { HOME_WALLPAPER_COPY } from '@/lib/home-desktop/wallpaper';

export function AppearanceSection() {
  return (
    <section id="theme" className={`${panelClass} scroll-mt-4`}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary flex items-center gap-2">Appearance
        <InfoTip label="Appearance" text="Choose how Urganize looks on this device." />
      </h2>
      <ThemeToggle />
      {/* Home wallpaper (#1305). Computers only, like Home's own layout. */}
      <div className="mt-6 hidden max-w-[360px] lg:block">
        <h3 className="text-sm font-semibold text-content-primary">Home wallpaper</h3>
        <p className="mt-0.5 text-[13px] leading-[18px] text-content-secondary">{HOME_WALLPAPER_COPY.settingsAbout}</p>
        <HomeWallpaperChoice source="settings" className="mt-3" />
      </div>
    </section>
  );
}
