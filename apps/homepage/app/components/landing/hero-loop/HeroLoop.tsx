"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, type ReactNode } from "react";

// The hero loop's host (#952). The poster still is the server-rendered child:
// it is in the HTML, it sizes the frame and it stays the Largest Contentful
// Paint. After mount, and only when the visitor allows motion, the Stageshow
// loop downloads (its own chunk, never in the first load) and fades in on top
// of the poster, at the poster's exact aspect, so nothing moves. Reduced
// motion never imports it, and switching reduced motion on mid-loop removes
// it again.
const HeroLoopDemo = dynamic(() => import("./HeroLoopDemo"), { ssr: false, loading: () => null });

const PHONE = "(max-width: 639.98px)";
const REDUCE = "(prefers-reduced-motion: reduce)";

type Theme = "light" | "dark";

function readTheme(): Theme {
  return document.documentElement.dataset.marketingTheme === "light" ? "light" : "dark";
}

export function HeroLoop({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [motion, setMotion] = useState(false);
  const [phone, setPhone] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  // Which layout's stage has painted its first frame. The loop shows only once
  // the stage for the current layout has, so a remount (breakpoint crossed,
  // motion switched back on) falls back to the poster until it is ready.
  const [readyFor, setReadyFor] = useState<string | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia(REDUCE);
    const narrow = window.matchMedia(PHONE);
    const update = () => {
      setMotion(!reduce.matches);
      setPhone(narrow.matches);
      setReadyFor(null);
    };
    update();
    reduce.addEventListener("change", update);
    narrow.addEventListener("change", update);

    // The site's theme toggle writes data-marketing-theme on <html>.
    setTheme(readTheme());
    const themes = new MutationObserver(() => setTheme(readTheme()));
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["data-marketing-theme"] });

    return () => {
      reduce.removeEventListener("change", update);
      narrow.removeEventListener("change", update);
      themes.disconnect();
    };
  }, []);

  const layout = phone ? "phone" : "wide";
  const ready = useCallback(() => setReadyFor(layout), [layout]);
  const shown = motion && readyFor === layout;

  return (
    <div className={`hero-loop relative ${className}`.trim()} data-playing={shown || undefined}>
      {children}
      {motion ? (
        <div className="hero-loop-stage" aria-hidden="true">
          <HeroLoopDemo key={layout} theme={theme} compact={phone} onReady={ready} />
        </div>
      ) : null}
    </div>
  );
}
