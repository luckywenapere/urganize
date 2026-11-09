"use client";

import Link from "next/link";
import { HeaderDropdown } from "./HeaderDropdown";

// Order is deliberate and load-bearing, not cosmetic: this is the order we
// want Google to surface as sitelinks (founder calls, 2026-08-06 and
// 2026-08-09). Link order is one of the few sitelink signals we control —
// Google picks and ranks sitelinks itself, so this biases the choice rather
// than dictating it. Why Urganize and Privacy trail deliberately; Privacy is
// additionally noindexed (see lib/seo.ts) so it can never be a candidate,
// while its link stays here so crawlers can still reach it and READ that tag.
//
// Log in / Sign up point at pages on THIS domain, not straight at
// team.urganize.app, and that's the whole point: sitelinks under the
// urganize.app result can only be urganize.app pages — a subdomain is a
// separate site as far as that block is concerned. Those two pages then hand
// off to the app (see lib/app-urls.ts).
const productLinks = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  // Pruned 2026-10-18 (founder call): artist managers are the audience; the
  // executives and curators pages stay live but leave the menu. The
  // AI-artist page was hidden outright on 2026-10-18 (URG-385; it 404s).
  // "For record labels" came back 2026-11-09 (new positioning: artists,
  // managers, record labels); it points at the executives page.
  { href: "/for-managers", label: "For managers" },
  { href: "/for-executives", label: "For record labels" },
  { href: "/why-urganize", label: "Why Urganize" },
] as const;

// The "Product" submenu bundles every product page into one top-menu entry
// (URG-161). These pages live ONLY here — they were removed from the footer
// on purpose, so this menu is their single home. The toggle itself is
// HeaderDropdown; the trigger renders at every breakpoint, which is what
// keeps the menu reachable on mobile.
//
// Because this menu is their single home, its markup is ALWAYS rendered and
// merely hidden when closed — never `{open && <menu/>}`. Conditional mounting
// kept the links out of the served HTML until a human clicked, and crawlers
// don't click: /features, /pricing, /why-urganize and the persona pages had
// zero internal links anywhere on the site, so Google built
// its picture of us from the only pages it could see (Team, Community, Brand,
// Changelog, Terms) and drew its sitelinks from those. Keep the links in the
// DOM. The `hidden` attribute keeps them out of the accessibility tree and
// out of the tab order while closed, so this costs nothing visually.
//
// 2026-08-21: three persona pages were added here (executives, curators, AI
// artists). This menu is still their only home, so the DOM rule above now
// matters for five pages rather than two (four since /for-labels was removed
// on 2026-09-11).
export function ProductLinks({ close }: { close: () => void }) {
  return productLinks.map(({ href, label }) => (
    <Link
      key={href}
      role="menuitem"
      href={href}
      onClick={close}
      className="block px-5 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text-muted)] hover:bg-[var(--marketing-surface)] hover:text-[var(--marketing-text)]"
    >
      {label}
    </Link>
  ));
}

export function ProductMenu() {
  return (
    <HeaderDropdown label="Product">
      {(close) => <ProductLinks close={close} />}
    </HeaderDropdown>
  );
}
