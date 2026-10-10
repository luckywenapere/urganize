"use client";

import { useEffect, useState } from "react";
import { FaMoon, FaSun } from "react-icons/fa6";
import { applyTheme, persistTheme, resolveInitialTheme, type ThemeMode } from "@/lib/theme";

// Skeleton until mounted: the real theme is only knowable client-side (it
// depends on localStorage / matchMedia), so guessing here would mismatch
// whatever the pre-hydration script in layout.tsx already resolved.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    setTheme(resolveInitialTheme());
    setMounted(true);
  }, []);

  const handleToggle = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    persistTheme(next);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={!mounted}
      aria-label={mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : undefined}
      aria-hidden={!mounted}
      title={mounted ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : undefined}
      className={`-mx-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center transition-opacity ${
        mounted ? "opacity-100" : "opacity-0"
      } ${className}`}
    >
      {/* The button is the 44px hit area; the 40px disc is what you see, and
          the -mx-0.5 above cancels the extra 4px so the row does not widen. */}
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--marketing-toggle-bg)] text-[var(--marketing-toggle-icon)]">
        {theme === "dark" ? <FaSun className="h-4 w-4" /> : <FaMoon className="h-4 w-4" />}
      </span>
    </button>
  );
}
