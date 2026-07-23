'use client';

import { useEffect, useState } from 'react';
import { Moon, MonitorSmartphone, Sun } from 'lucide-react';
import {
  applyTheme,
  clearStoredTheme,
  getSystemTheme,
  persistTheme,
  readStoredPreference,
  type ThemePreference,
} from './theme';

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

const MODES: Array<{ pref: ThemePreference; label: string; Icon: typeof Sun }> = [
  { pref: 'light', label: 'Light', Icon: Sun },
  { pref: 'dark', label: 'Dark', Icon: Moon },
  { pref: 'system', label: 'System', Icon: MonitorSmartphone },
];

/**
 * Segmented Light / Dark / System control. "System" (2026-07-23, founder
 * call) clears the stored preference and follows the OS live — flipping the
 * machine's appearance re-themes the app without a reload. Pill-rounded,
 * sliding thumb, both options always visible.
 */
export function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    const stored = readStoredPreference();
    setPreference(stored);
    applyTheme(stored === 'system' ? getSystemTheme() : stored);
    setMounted(true);
  }, []);

  // Live-follow the OS while on System: the media-query listener re-applies
  // the theme the moment the machine flips appearance.
  useEffect(() => {
    if (preference !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme(getSystemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const selectPreference = (next: ThemePreference) => {
    if (next === preference) return;
    setPreference(next);
    if (next === 'system') {
      clearStoredTheme();
      applyTheme(getSystemTheme());
    } else {
      persistTheme(next);
      applyTheme(next);
    }
  };

  const width = compact ? 'w-[126px]' : 'w-[252px]';

  if (!mounted) {
    // Same footprint as the mounted control so the layout doesn't shift.
    return (
      <div
        aria-hidden
        className={`inline-block h-9 ${width} rounded-full border border-stroke-default bg-bg-surface opacity-70 ${className}`}
      />
    );
  }

  const activeIndex = MODES.findIndex((entry) => entry.pref === preference);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`relative inline-grid h-9 ${width} grid-cols-3 rounded-full border border-stroke-default bg-bg-surface p-0.5 ${className}`}
    >
      {/* Sliding thumb — sized to one cell, translated by its own width to
          land on the active segment. transform (not left) so it animates on
          the compositor. */}
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc(33.333%-1.33px)] rounded-full border border-stroke-strong bg-bg-elevated transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {MODES.map(({ pref, label, Icon }) => {
        const isActive = preference === pref;
        return (
          <button
            key={pref}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => selectPreference(pref)}
            title={pref === 'system' ? 'Match this device’s appearance' : undefined}
            className={`relative z-[1] inline-flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ${
              isActive
                ? 'text-content-primary'
                : 'text-content-tertiary hover:text-content-secondary'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}
