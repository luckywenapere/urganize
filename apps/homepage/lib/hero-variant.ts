// The homepage hero A/B (2026-10-18, URG-376): "dawn" (the Release Dawn sky
// and four floating cards, founder approved 2026-10-18) against "flat" (the
// hero as it was). Assigned BEFORE first paint by an inline script, the same
// way the theme is (app/layout.tsx) and the signed-in redirect is
// (lib/login-redirect.ts), so the page stays static, nobody sees the hero
// switch looks after hydration, and the server never has to know.
//
// The script writes `data-hero-variant` on <html>. globals.css shows the sky
// and cards only under html[data-hero-variant="dawn"], so a crawler, a no-JS
// visitor or a failed script gets the flat hero, which is the safe default.
//
// The visitor keeps their arm: it is stored under STORAGE_KEY and reused on
// every later visit. instrumentation-client.ts registers it as the PostHog
// super property `hero_variant`, so every PostHog event (pageviews,
// autocapture, waitlist_submit, demo_video_open) can be broken down by it, and
// lib/analytics.ts adds it to the GA events.
//
// NEXT_PUBLIC_HERO_VARIANT (build time, so a change needs a redeploy):
//   "split" (default) 50/50, sticky per browser
//   "dawn"  everyone sees dawn (ship the winner)
//   "flat"  everyone sees the old hero (kill switch)
// Forcing does not overwrite a stored arm, so going back to "split" puts each
// visitor back in the arm they had.

export const HERO_VARIANT_STORAGE_KEY = "urganize.heroVariant";

export type HeroVariant = "dawn" | "flat";
export type HeroVariantMode = HeroVariant | "split";

export function heroVariantMode(raw: string | undefined): HeroVariantMode {
  return raw === "dawn" || raw === "flat" ? raw : "split";
}

/** The assignment as an IIFE, written out by hand: it runs in the browser
 *  with no imports, before the hero is parsed. Fails to "flat". */
export function buildHeroVariantScript(mode: HeroVariantMode): string {
  return `(function(){var d=document.documentElement;try{var m=${JSON.stringify(
    mode,
  )};if(m==="dawn"||m==="flat"){d.dataset.heroVariant=m;return}var k=${JSON.stringify(
    HERO_VARIANT_STORAGE_KEY,
  )};var v=localStorage.getItem(k);if(v!=="dawn"&&v!=="flat"){v=Math.random()<0.5?"dawn":"flat";localStorage.setItem(k,v)}d.dataset.heroVariant=v}catch(e){d.dataset.heroVariant="flat"}})();`;
}

export const HERO_VARIANT_SCRIPT = buildHeroVariantScript(
  heroVariantMode(process.env.NEXT_PUBLIC_HERO_VARIANT),
);

/** The arm this browser is in, for analytics. The attribute on <html> on the
 *  homepage; the stored arm on any other page; null if never assigned. */
export function readHeroVariant(): HeroVariant | null {
  if (typeof document === "undefined") return null;
  const attr = document.documentElement.dataset.heroVariant;
  if (attr === "dawn" || attr === "flat") return attr;
  try {
    const stored = localStorage.getItem(HERO_VARIANT_STORAGE_KEY);
    return stored === "dawn" || stored === "flat" ? stored : null;
  } catch {
    return null;
  }
}
