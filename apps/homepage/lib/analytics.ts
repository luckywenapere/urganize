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
  | "faq_open";

type Gtag = (command: "event", name: string, params?: Record<string, string>) => void;

export function trackEvent(name: LandingEvent, params?: Record<string, string>) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") return;
  gtag("event", name, params);
}
