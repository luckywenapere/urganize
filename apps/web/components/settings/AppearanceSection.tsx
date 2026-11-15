'use client';

import { panelClass } from './panelClass';
import { InfoTip } from '@/components/shared/HelpTip';
import { AppearanceChoice } from './AppearanceChoice';

export function AppearanceSection() {
  return (
    <section id="theme" className={`${panelClass} scroll-mt-4`}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary flex items-center gap-2">Appearance
        <InfoTip label="Appearance" text="Choose how Urganize looks on this device. It also sets the picture behind every page." />
      </h2>
      {/* Light, Dark, Auto, System (#1320): the theme and the wallpaper. */}
      <AppearanceChoice />
    </section>
  );
}
