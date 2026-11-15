'use client';

// Light, Dark, Auto, System (#1320). The one control for how the app looks:
// it sets the theme and the picture behind every page (lib/appearance.ts).
// There is no separate wallpaper choice.
//
// Real radio buttons in a fieldset, so Tab reaches the group, the arrow keys
// move the pick and a screen reader says "1 of 4". The line under the group
// says what the current choice does.

import { useEffect, useId, useState } from 'react';
import { Clock, Moon, MonitorSmartphone, Sun } from '@/components/icons';
import { THEME_CHOICES, THEME_CHOICE_COPY, type ThemeChoice } from '@/lib/appearance';
import { APPEARANCE_CHANGE_EVENT, readThemeChoice, saveThemeChoice } from '@/lib/appearance-client';

const ICONS: Record<ThemeChoice, typeof Sun> = {
  light: Sun,
  dark: Moon,
  auto: Clock,
  system: MonitorSmartphone,
};

export function AppearanceChoice({ className = '', showAbout = true }: { className?: string; showAbout?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  const name = useId();
  const aboutId = useId();

  useEffect(() => {
    const sync = () => setChoice(readThemeChoice());
    sync();
    window.addEventListener(APPEARANCE_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(APPEARANCE_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (choice === null) {
    // Same footprint as the control, so nothing moves when it arrives.
    return <div aria-hidden className={`h-10 w-full max-w-[360px] rounded-full border border-stroke-default bg-bg-surface opacity-70 ${className}`} />;
  }

  return (
    <fieldset className={`w-full max-w-[360px] ${className}`} aria-describedby={showAbout ? aboutId : undefined}>
      <legend className="sr-only">Appearance</legend>
      <div className="grid h-10 grid-cols-4 rounded-full border border-stroke-default bg-bg-surface p-0.5">
        {THEME_CHOICES.map((id) => {
          const Icon = ICONS[id];
          return (
            <label key={id} className="relative block cursor-pointer">
              <input
                type="radio"
                name={name}
                value={id}
                aria-label={THEME_CHOICE_COPY[id].label}
                checked={choice === id}
                onChange={() => {
                  setChoice(id);
                  saveThemeChoice(id);
                }}
                className="peer sr-only"
              />
              <span className="flex h-full items-center justify-center gap-1.5 rounded-full text-xs font-medium text-content-tertiary transition-colors hover:text-content-secondary peer-checked:border peer-checked:border-stroke-strong peer-checked:bg-bg-elevated peer-checked:text-content-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {THEME_CHOICE_COPY[id].label}
              </span>
            </label>
          );
        })}
      </div>
      {showAbout ? (
        <p id={aboutId} className="mt-2 text-[13px] leading-[18px] text-content-secondary">
          {THEME_CHOICE_COPY[choice].about}
        </p>
      ) : null}
    </fieldset>
  );
}
