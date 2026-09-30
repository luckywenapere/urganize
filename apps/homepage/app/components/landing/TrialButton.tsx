import { APP_SIGNUP_URL } from "@/lib/app-urls";

export type TrialButtonLocation =
  | "hero"
  | "pricing"
  | "final"
  | "features_hero"
  | "features_cta"
  | "for_managers_hero"
  | "for_managers_cta"
  | "for_executives_hero"
  | "for_executives_cta"
  | "for_ai_artists_hero"
  | "for_ai_artists_cta"
  | "guide_cta";

// The site's one primary ask (2026-09-02). Three mounts on the homepage
// (hero, pricing, final — RosterSection carried a fourth, "roster", until it
// was removed 2026-09-11, founder call), then /features and the three
// self-serve persona pages in the same day's follow-up: one component, so
// the label, the destination and the tracking
// attribute cannot drift between them the way the three hand-rolled pill
// variants on this site already had. The header pill and the pricing cards
// keep their own sizing and carry the same data-track attributes by hand, so
// LandingAnalytics counts every trial click on the site under one event.
//
// A plain <a>, not next/link: APP_SIGNUP_URL leaves the marketing domain for
// the product app. It is /onboarding, NOT /auth — /auth is login-only and a
// "start" button pointed there lands people on a form with no way to create
// an account (see lib/app-urls.ts).
//
// Server component. The click is reported by LandingAnalytics, one delegated
// listener that reads `data-track` / `data-location` off whichever anchor was
// clicked, so no section has to become a client component to be measured.
export function TrialButton({
  location,
  size = "md",
  className = "",
}: {
  location: TrialButtonLocation;
  size?: "md" | "lg";
  className?: string;
}) {
  const sizing =
    size === "lg"
      ? "px-8 py-4 text-base"
      : "px-7 py-3.5 text-sm sm:text-base";
  return (
    <a
      href={APP_SIGNUP_URL}
      data-track="start_trial_click"
      data-location={location}
      className={`inline-flex cursor-pointer touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] transition-colors hover:bg-[var(--marketing-primary-hover)] ${sizing} ${className}`.trim()}
    >
      Try Urganize
    </a>
  );
}
