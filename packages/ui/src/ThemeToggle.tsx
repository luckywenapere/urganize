'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, persistTheme, resolveInitialTheme, type ThemeMode } from './theme';

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

const MODES = [
  { mode: 'light' as ThemeMode, label: 'Light', Icon: Sun },
  { mode: 'dark' as ThemeMode, label: 'Dark', Icon: Moon },
];

/**
 * Segmented Light/Dark control (redesigned 2026-07-23 — the old single
 * cycling pill read as dated). Two labeled segments with a thumb that
 * slides to the active side over 200ms; sharp corners per the Brand Bible.
 * Both options are always visible, so there's no guessing what clicking
 * will do — you pick a mode, you don't toggle into the unknown.
 */
export function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('dark');

  useEffect(() => {
    const resolved = resolveInitialTheme();
    setTheme(resolved);
    applyTheme(resolved);
    setMounted(true);
  }, []);

  const selectMode = (next: ThemeMode) => {
    if (next === theme) return;
    setTheme(next);
    applyTheme(next);
    persistTheme(next);
  };

  if (!mounted) {
    // Same footprint as the mounted control so the layout doesn't shift.
    return (
      <div
        aria-hidden
        className={`inline-block h-9 ${compact ? 'w-[84px]' : 'w-[176px]'} rounded-full border border-stroke-default bg-bg-surface opacity-70 ${className}`}
      />
    );
  }

  const activeIndex = MODES.findIndex((entry) => entry.mode === theme);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`relative inline-grid h-9 ${compact ? 'w-[84px]' : 'w-[176px]'} grid-cols-2 rounded-full border border-stroke-default bg-bg-surface p-0.5 ${className}`}
    >
      {/* Sliding thumb — sized to one cell, translated by its own width to
          land on the active segment. transform (not left) so it animates on
          the compositor. */}
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full border border-stroke-strong bg-bg-elevated transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {MODES.map(({ mode, label, Icon }) => {
        const isActive = theme === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => selectMode(mode)}
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
