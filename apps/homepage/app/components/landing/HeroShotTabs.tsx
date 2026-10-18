"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

// The hero shot's Artists | Rollouts tabs (2026-10-18, URG-378, founder ask).
//
// The capture already DRAWS the two tabs (phone: the pill at the top of the
// screen; desktop: the Artists and Rollouts rows in the sidebar). Instead of
// rebuilding that UI in HTML, transparent buttons sit exactly over the drawn
// tabs, positioned in percentages of the frame (globals.css, .hero-tab), and
// swap which capture pair is showing. Nothing else in the image reacts.
//
// LCP: Rollouts is the default and is the server-rendered child, untouched
// (eager, fetchPriority high). The Artists pair is not in the HTML at all; it
// mounts on idle, or the moment a tab is hovered, focused or pressed, and only
// shows once its images have decoded, so a tap before it arrives never flashes
// an empty frame. It is absolutely positioned over the Rollouts layer, which
// stays in flow and sizes the frame, so the swap can never shift layout (both
// pairs share the same capture size per breakpoint).
type Tab = "artists" | "rollouts";
const TABS: { id: Tab; label: string }[] = [
  { id: "artists", label: "Artists" },
  { id: "rollouts", label: "Rollouts" },
];

type Props = {
  /** The Rollouts capture pair (default view, the LCP image). */
  rollouts: ReactNode;
  /** The Artists capture pair, mounted lazily. */
  artists: ReactNode;
};

export function HeroShotTabs({ rollouts, artists }: Props) {
  const [tab, setTab] = useState<Tab>("rollouts");
  const [armed, setArmed] = useState(false);
  const [artistsReady, setArtistsReady] = useState(false);
  const artistsLayer = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ artists: null, rollouts: null });
  const baseId = useId();
  const tabId = (id: Tab) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  const arm = useCallback(() => setArmed(true), []);

  // Fetch the Artists pair once the page is idle (timer fallback for Safari).
  useEffect(() => {
    if (armed) return;
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(arm, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(arm, 2500);
    return () => window.clearTimeout(timer);
  }, [armed, arm]);

  // Ready when every image in the Artists layer has decoded. `load` does not
  // bubble, so listen in the capture phase on the layer.
  useEffect(() => {
    const layer = artistsLayer.current;
    if (!armed || !layer) return;
    const check = () => {
      const images = [...layer.querySelectorAll("img")];
      if (images.length > 0 && images.every((img) => img.complete)) setArtistsReady(true);
    };
    layer.addEventListener("load", check, true);
    layer.addEventListener("error", check, true);
    check();
    return () => {
      layer.removeEventListener("load", check, true);
      layer.removeEventListener("error", check, true);
    };
  }, [armed]);

  const select = (next: Tab, focus = false) => {
    arm();
    if (focus) tabRefs.current[next]?.focus();
    if (next === tab) return;
    setTab(next);
    trackEvent("hero_tab_switch", { tab: next });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((t) => t.id === tab);
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    select(TABS[next].id, true);
  };

  const showArtists = tab === "artists" && artistsReady;

  return (
    <>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(tab)} className="relative h-full">
        <div className="h-full" aria-hidden={showArtists || undefined}>
          {rollouts}
        </div>
        {armed ? (
          <div
            ref={artistsLayer}
            aria-hidden={!showArtists || undefined}
            className="hero-shot-layer"
            data-visible={showArtists ? "true" : "false"}
          >
            {artists}
          </div>
        ) : null}
      </div>
      <div
        role="tablist"
        aria-label="Product views"
        aria-orientation="horizontal"
        className="hero-tablist"
        onPointerEnter={arm}
        onFocus={arm}
      >
        {TABS.map(({ id, label }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              id={tabId(id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              data-tab={id}
              className="hero-tab"
              onPointerDown={arm}
              onClick={() => select(id)}
              onKeyDown={onKeyDown}
            >
              <span className="hero-tab-pill" aria-hidden="true" />
              <span className="sr-only">{label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
