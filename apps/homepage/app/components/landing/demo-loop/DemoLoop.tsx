"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { ResponsiveProductShot } from "../ResponsiveProductShot";
import { DEMO_LOOP_POSTER } from "./poster";

// The UrgAns demo loop's host (#956), the hero loop's pattern (HeroLoop.tsx).
// The poster still renders first and sizes the frame. After mount, and only
// when the visitor allows motion, the Stageshow loop downloads (its own chunk)
// and fades in over the poster at the same aspect, so nothing moves. Reduced
// motion never imports it, and switching reduced motion on removes it again.
// The cross-fade is the hero loop's own CSS (globals.css, "THE HERO LOOP"):
// .hero-loop, .hero-loop-poster and .hero-loop-stage are generic.
const DemoLoopScene = dynamic(() => import("./DemoLoopScene"), { ssr: false, loading: () => null });

const PHONE = "(max-width: 639.98px)";
const REDUCE = "(prefers-reduced-motion: reduce)";

type Theme = "light" | "dark";

function readTheme(): Theme {
  return document.documentElement.dataset.marketingTheme === "light" ? "light" : "dark";
}

export function DemoLoop({ className = "" }: { className?: string }) {
  const [motion, setMotion] = useState(false);
  const [phone, setPhone] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  // Which layout's stage has painted its first frame, so a remount (breakpoint
  // crossed) falls back to the poster until the new stage is ready.
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
      <div className="hero-loop-poster">
        <ResponsiveProductShot
          desktop={DEMO_LOOP_POSTER.desktop}
          phone={DEMO_LOOP_POSTER.phone}
          alt="AI answers what is still open on the single Golden Hour, and the playlist pitch is assigned to Ife."
          sizes="(min-width: 960px) 896px, calc(100vw - 32px)"
          phoneSizes="358px"
          fetchPriority="auto"
          className="block h-auto w-full"
        />
      </div>
      {motion ? (
        <div className="hero-loop-stage" aria-hidden="true">
          <DemoLoopScene key={layout} theme={theme} compact={phone} onReady={ready} />
        </div>
      ) : null}
    </div>
  );
}
