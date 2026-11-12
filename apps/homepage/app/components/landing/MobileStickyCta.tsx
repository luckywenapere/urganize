"use client";

import { useEffect, useState } from "react";
import { PRIMARY_CTA, SIGNUP_OPEN } from "@/lib/app-urls";
import { TrialButton } from "./TrialButton";

// The homepage's sign-up button, kept within thumb reach on a phone (#1217,
// from the Coframe review of 11 Nov 2026). On a phone the hero button scrolls
// away after the first screen and the next filled button is the closing
// section, about 6,000px later. The header does carry the same link, but on
// this page it is drawn as an outline on purpose (`.home-v2 .header-cta`), so
// the page had no filled ask for most of its length.
//
// It shows only BETWEEN the two filled buttons: once the hero block (#waitlist)
// has scrolled up out of view, and never while the closing block (#join) is on
// screen, so the page never shows two filled buttons at once. That also keeps
// it clear of BackToTopButton, which only appears at the footer. Phones only
// (md:hidden). With sign-up closed it renders nothing: the waitlist is a form
// in the hero, and a bar that jumps back up to it would only repeat the header.
export function MobileStickyCta() {
  const [pastHero, setPastHero] = useState(false);
  const [atFinal, setAtFinal] = useState(false);

  useEffect(() => {
    if (!SIGNUP_OPEN) return;
    const hero = document.getElementById("waitlist");
    const final = document.getElementById("join");
    if (!hero || !final) return;

    const heroObserver = new IntersectionObserver(([entry]) => {
      // Past the hero means it has left through the TOP, not that it has not
      // been reached yet.
      setPastHero(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    });
    const finalObserver = new IntersectionObserver(([entry]) => {
      setAtFinal(entry.isIntersecting || entry.boundingClientRect.top < 0);
    });
    heroObserver.observe(hero);
    finalObserver.observe(final);
    return () => {
      heroObserver.disconnect();
      finalObserver.disconnect();
    };
  }, []);

  if (!SIGNUP_OPEN) return null;
  const visible = pastHero && !atFinal;

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--marketing-border)] bg-[var(--marketing-bg)]/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-all duration-300 md:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <TrialButton location="mobile_sticky" className="w-full" label={PRIMARY_CTA.label} />
    </div>
  );
}
