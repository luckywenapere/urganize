import type { ReactNode } from "react";
import { clsx } from "clsx";

// Page Dawn (2026-10-18): the homepage's Release Dawn sky, softened, behind
// the opening block of every other marketing page, so the site reads as one
// place. Founder direction: lower intensity than the homepage, no floating
// cards, light and dark, nothing else on the page changes.
//
// Wrap a page's opening block (mono label, h1, lead, its action) in
// <PageDawn>. The sky is anchored to that block, not to the viewport or the
// section, so the horizon always sits just under the block's last line however
// the headline wraps, and it is back to the base colour about 260px below it.
// The page's <main> needs `isolate overflow-x-clip` (the sky paints behind the
// content at z-index -1 and is 100vw wide). Styling: globals.css, "Page Dawn".
// CSS only: no image request, no JS, no layout cost (absolute, aria-hidden).
//
// Not part of the homepage hero A/B (lib/hero-variant.ts): subpages show it to
// everyone, so it does not read data-hero-variant.
export function PageDawn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("page-dawn", className)}>
      <div aria-hidden="true" className="page-sky">
        <div className="hero-sky-grain" />
      </div>
      {children}
    </div>
  );
}
