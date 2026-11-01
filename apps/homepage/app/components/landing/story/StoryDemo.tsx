"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState, type ComponentType } from "react";
import type { Theme } from "@urganize/stageshow";

// One small animation per story step (#953, mocks approved by the founder
// 2026-11-01), built on the Stageshow kit the way
// docs/notes/2026-11-01-stageshow-kit.md says:
//
// - The kit loads lazily (next/dynamic, ssr: false), so it is not in the
//   homepage's first load. All three scenes come from one module (scenes.ts),
//   so they share one chunk and one copy of the kit.
// - The server renders the poster: the scene's finished state as a WebP, light
//   and dark, at the stage's exact size, so nothing moves when the animation
//   swaps in. It is also what reduced motion shows, and the scene is then
//   never downloaded.
// - Each scene plays once when it scrolls into view and holds its result
//   (<Stage play="once"> only runs while on screen).
//
// The stage picks its phone design when its box is under 520px wide; the
// poster makes the same choice with a container query on the same box, so the
// poster and the scene always agree. The scenes are ported from the mock's
// Stageshow source (examples/urg-plan, urg-owner, urg-late, kept outside the
// repo); if a scene changes, re-film its four posters from it with --reduced.

export type StoryDemoName = "plan" | "owner" | "late";

type Poster = { wide: [number, number]; compact: [number, number] };

// Design sizes in CSS px; the WebPs are filmed at 2x
const POSTERS: Record<StoryDemoName, Poster> = {
  plan: { wide: [560, 400], compact: [358, 430] },
  owner: { wide: [560, 400], compact: [358, 420] },
  late: { wide: [560, 380], compact: [358, 380] },
};

type Scenes = typeof import("./scenes");
type Scene = ComponentType<{ theme: Theme }>;

// A scene whose chunk fails to load (a weak connection, a deploy that removed
// the old chunk) stays on its poster instead of throwing to the error page.
function scene(name: StoryDemoName, pick: (m: Scenes) => Scene) {
  const Fallback: Scene = () => <StoryPoster name={name} />;
  return dynamic(() => import("./scenes").then(pick).catch(() => Fallback), {
    ssr: false,
    loading: () => <StoryPoster name={name} />,
  });
}

const DEMOS = {
  plan: scene("plan", (m) => m.PlanDemo),
  owner: scene("owner", (m) => m.OwnerDemo),
  late: scene("late", (m) => m.LateDemo),
};

function useMotionAllowed() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowed(!mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return allowed;
}

// The site's theme lives on <html data-marketing-theme>, set before paint and
// changed by the header's toggle. The stage draws in the same theme.
function useSiteTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const html = document.documentElement;
    const update = () => setTheme(html.dataset.marketingTheme === "dark" ? "dark" : "light");
    update();
    const observer = new MutationObserver(update);
    observer.observe(html, { attributes: true, attributeFilter: ["data-marketing-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function PosterImage({
  name,
  layout,
  theme,
}: {
  name: StoryDemoName;
  layout: "wide" | "compact";
  theme: "light" | "dark";
}) {
  const [width, height] = POSTERS[name][layout];
  const file = `/images/product/story-${name}${layout === "compact" ? "-phone" : ""}${theme === "dark" ? "-dark" : ""}.webp`;
  return (
    <Image
      src={file}
      alt=""
      width={width}
      height={height}
      sizes={`${width}px`}
      // Below the fold: only the one this layout and theme shows is fetched
      loading="lazy"
      className={`${theme === "light" ? "theme-shot-light" : "theme-shot-dark"} mx-auto h-auto w-full rounded-xl ring-1 ring-[color:var(--marketing-border)]`}
      style={{ maxWidth: width }}
    />
  );
}

function StoryPoster({ name }: { name: StoryDemoName }) {
  return (
    <>
      <div className="@[520px]:hidden">
        <PosterImage name={name} layout="compact" theme="light" />
        <PosterImage name={name} layout="compact" theme="dark" />
      </div>
      <div className="hidden @[520px]:block">
        <PosterImage name={name} layout="wide" theme="light" />
        <PosterImage name={name} layout="wide" theme="dark" />
      </div>
    </>
  );
}

export function StoryDemo({ name, label }: { name: StoryDemoName; label: string }) {
  const motion = useMotionAllowed();
  const theme = useSiteTheme();
  const Demo = DEMOS[name];
  return (
    <div className="@container" role="img" aria-label={label}>
      {motion ? <Demo theme={theme} /> : <StoryPoster name={name} />}
    </div>
  );
}
