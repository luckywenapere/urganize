"use client";

import { useEffect, useRef, type ReactNode } from "react";

// The bento's beats (#954). The tiles are server-rendered in their END state,
// so a blocked or slow script, or reduced motion, still shows the finished
// story. After mount, each tile that is still below the fold gets data-armed,
// which puts it back to its "before" state (feature-bento.css); when a third
// of it scrolls into view the attribute comes off and CSS plays the change
// once. A tile already on screen at mount is left alone, so nothing flashes
// backwards. One trigger per tile, so on a phone, where the tiles stack, each
// plays as it is reached. LEAD_MS waits out ScrollReveal's 0.5s fade-in of
// the section, so the beat is not spent while the tile is still transparent.
// No animation library: this grid does not need the Stageshow kit.
const LEAD_MS = 600;

export function FeatureBentoPlay({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const grid = ref.current;
    if (!grid || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const below = Array.from(grid.children).filter(
      (tile) => tile.getBoundingClientRect().top >= window.innerHeight,
    );
    if (below.length === 0) return;

    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          timers.push(window.setTimeout(() => entry.target.removeAttribute("data-armed"), LEAD_MS));
        }
      },
      { threshold: 0.35 },
    );
    for (const tile of below) {
      tile.setAttribute("data-armed", "");
      io.observe(tile);
    }
    return () => {
      io.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      below.forEach((tile) => tile.removeAttribute("data-armed"));
    };
  }, []);

  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}
