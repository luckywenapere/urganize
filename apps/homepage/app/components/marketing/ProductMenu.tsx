"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FaChevronDown } from "react-icons/fa6";

// Order is deliberate and load-bearing, not cosmetic: these are the four
// pages we want Google to surface as sitelinks, in this order (founder call,
// 2026-08-06). Link order is one of the few sitelink signals we control —
// Google picks and ranks sitelinks itself, so this biases the choice rather
// than dictating it. Why Urganize and Privacy trail deliberately; Privacy is
// additionally noindexed (see lib/seo.ts) so it can never be a candidate,
// while its link stays here so crawlers can still reach it and READ that tag.
const productLinks = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-managers", label: "For managers" },
  { href: "/for-labels", label: "For labels" },
  { href: "/why-urganize", label: "Why Urganize" },
  { href: "/privacy", label: "Privacy" },
] as const;

// The "Product" submenu bundles every product page into one top-menu entry
// (URG-161). These pages live ONLY here — they were removed from the footer
// on purpose, so this menu is their single home. Click-to-toggle (not
// hover) so the same control works on touch screens; the trigger renders at
// every breakpoint, which is what keeps the menu reachable on mobile.
//
// Because this menu is their single home, its markup is ALWAYS rendered and
// merely hidden when closed — never `{open && <menu/>}`. Conditional mounting
// kept the links out of the served HTML until a human clicked, and crawlers
// don't click: /features, /pricing, /why-urganize, /for-managers and
// /for-labels had zero internal links anywhere on the site, so Google built
// its picture of us from the only pages it could see (Team, Community, Brand,
// Changelog, Terms) and drew its sitelinks from those. Keep the links in the
// DOM. The `hidden` attribute keeps them out of the accessibility tree and
// out of the tab order while closed, so this costs nothing visually.
export function ProductMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)]"
      >
        Product
        <FaChevronDown
          aria-hidden
          className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        role="menu"
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-4 min-w-[11rem] border border-[color:var(--marketing-border)] bg-[var(--marketing-bg)] py-2 shadow-lg"
      >
        {productLinks.map(({ href, label }) => (
          <Link
            key={href}
            role="menuitem"
            href={href}
            onClick={() => setOpen(false)}
            className="block px-5 py-2.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] hover:bg-[var(--marketing-surface)] hover:text-[var(--marketing-text)]"
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
