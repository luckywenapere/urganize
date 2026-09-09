'use client';

import Link from 'next/link';
import { panelClass } from './panelClass';

// Same flag the pages and every /api/press-kits route read. With it off there
// is nothing to reach, so the row does not render.
const PRESS_KITS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PRESS_KITS === 'true';

/**
 * Press kits' ONLY entry point since 2026-09-09 (founder call: "Press Kit
 * should only be accessible through settings not visible through the main app
 * view"). The side menu row, the topbar icon, the phone's bottom tab and the
 * page-search entry all left the same day.
 *
 * THE PAGES DID NOT MOVE. They still live at /dashboard/press-kits, so every
 * link already pointing there still resolves — the plan-approval banner's
 * "Open the press kit" CTA (PostPlanKitPrompt), an UrgAns navigate action, a
 * bookmark. Moving the route under /settings would have broken all three and
 * put a heavy client page inside a tab whose skeleton contract requires it
 * stay statically prerendered.
 *
 * In Workspace rather than Account because a kit belongs to an artist on the
 * roster, not to the person reading this — the same reason the artist rows sit
 * in this tab. It goes above the destructive release section, which stays last.
 */
export function PressKitsSection() {
  if (!PRESS_KITS_ENABLED) return null;

  return (
    <section className={panelClass}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Press kits
      </h2>
      <div className="rounded-lg border border-stroke-subtle bg-bg-elevated p-4">
        <p className="text-sm text-content-secondary">
          One standing page per artist, with their story, photos and who to contact. Send the
          link to press and it stays current on its own.
        </p>
        <Link
          href="/dashboard/press-kits"
          className="mt-4 inline-block rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:bg-bg-hover"
        >
          Open press kits
        </Link>
      </div>
    </section>
  );
}
