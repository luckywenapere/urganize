import { readHeroVariant } from "./hero-variant";

// The marketing site's one analytics seam (2026-09-02). GA4 is loaded
// site-wide in app/layout.tsx (afterInteractive), so `gtag` is a global that
// may or may not exist yet when a handler fires — every call is guarded, and
// a missing tag is a no-op, never an error. Event names are an enum so a
// typo cannot quietly split one funnel step into two GA events.
//
// Why these four and nothing else: they are the homepage's funnel. Before
// this the page fired ONE event (demo_video_open) and the waitlist form
// fired none, so the conversion rate the redesign is meant to move could
// not be measured at all.
export type LandingEvent =
  | "start_trial_click"
  | "demo_video_open"
  | "waitlist_submit"
  | "faq_open"
  // The hero shot's Artists | Rollouts tabs (URG-378), with { tab }.
  | "hero_tab_switch"
  // Self-serve checkout (2026-10-22): a Get <Plan> card on /pricing, with
  // { plan, period }.
  | "pricing_plan_clicked";

//
// HERO A/B (2026-10-18, URG-376). Each event also carries `hero_variant`
// ("dawn" | "flat") once the visitor has an arm, and the same four events are
// mirrored to PostHog (already loaded by instrumentation-client.ts, which
// registers hero_variant as a super property), so the waitlist conversion the
// A/B is judged on lives in PostHog too. No new event names. If PostHog has not
// finished loading (it waits for idle) the mirror is skipped, never queued.
type Gtag = (command: "event", name: string, params?: Record<string, string>) => void;

export function trackEvent(name: LandingEvent, params?: Record<string, string>) {
  if (typeof window === "undefined") return;
  const heroVariant = readHeroVariant();
  const withVariant = heroVariant ? { ...params, hero_variant: heroVariant } : params;
  if (process.env.NEXT_PUBLIC_POSTHOG_TOKEN) {
    void import("posthog-js")
      .then(({ default: posthog }) => {
        if (posthog.__loaded) posthog.capture(name, withVariant);
      })
      .catch(() => {});
  }
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") return;
  gtag("event", name, withVariant);
}
