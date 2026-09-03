"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

// The homepage's funnel events, from one place (2026-09-02). Every section on
// the page is a server component; this renders nothing and listens at the
// document for the two interactions worth counting:
//
// - a click on any `a[data-track="start_trial_click"]` (the TrialButton
//   mounts), reported with its `data-location` so the four asks can be
//   compared against each other;
// - a `toggle` on any `details[data-faq]` opening (the FAQ), reported with the
//   question. `toggle` does not bubble, so the listener is in the CAPTURE
//   phase — a bubbling listener at the document would never hear it.
export function LandingAnalytics() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest?.("a[data-track]");
      if (!link || link.getAttribute("data-track") !== "start_trial_click") return;
      trackEvent("start_trial_click", {
        location: link.getAttribute("data-location") ?? "unknown",
      });
    };
    const onToggle = (event: Event) => {
      const details = event.target as HTMLDetailsElement | null;
      if (!details || !details.matches?.("details[data-faq]") || !details.open) return;
      const question = details.querySelector("summary")?.textContent?.trim() ?? "";
      trackEvent("faq_open", { question });
    };
    document.addEventListener("click", onClick);
    document.addEventListener("toggle", onToggle, true);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("toggle", onToggle, true);
    };
  }, []);
  return null;
}
