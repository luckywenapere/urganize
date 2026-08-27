"use client";

import { useEffect, useRef, useState } from "react";
import { RiArrowUpLine } from "react-icons/ri";

// Mobile-only back-to-top control (2026-08-25, founder request). Mounted by
// MarketingFooter so every marketing page gets it for free. The component
// renders its own zero-height sentinel where it is mounted (the top of the
// footer); an IntersectionObserver on that sentinel — the ScrollReveal
// pattern, minus the disconnect, since this toggles both ways — shows the
// button only once the visitor has actually reached the bottom of the page,
// which is what was asked for: not a scroll-past-the-hero button, an
// at-the-end one. Hidden from md up (the founder's ask was mobile; on a
// desktop the header is one flick of the wheel away).
export function BackToTopButton() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsAtBottom(entry.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px w-px" />
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Back to top"
        aria-hidden={!isAtBottom}
        tabIndex={isAtBottom ? 0 : -1}
        className={`fixed bottom-5 right-5 z-40 flex size-11 items-center justify-center rounded-full bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)] shadow-[0_10px_30px_var(--marketing-shadow-strong)] transition-all duration-300 hover:bg-[var(--marketing-primary-hover)] md:hidden ${
          isAtBottom
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <RiArrowUpLine aria-hidden size={20} />
      </button>
    </>
  );
}
