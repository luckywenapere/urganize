'use client';

import { useEffect, useState } from 'react';
import { applyTheme, persistTheme, resolveInitialTheme, type ThemeMode } from '@/lib/theme';

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

export function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('dark');

  useEffect(() => {
    const resolved = resolveInitialTheme();
    setTheme(resolved);
    applyTheme(resolved);
    setMounted(true);
  }, []);

  const handleToggle = () => {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
    persistTheme(nextTheme);
  };

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        aria-hidden
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary opacity-70 ${className}`}
      >
        <span className="inline-block h-4 w-4 animate-breathe rounded-full bg-content-tertiary/60" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`inline-flex items-center gap-2 rounded-full border border-stroke-default bg-bg-surface px-3 py-2 text-xs font-medium text-content-primary transition hover:bg-bg-hover ${className}`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-bg-elevated text-sm">
        {theme === 'dark' ? 'L' : 'D'}
      </span>
      {!compact && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}
