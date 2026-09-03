"use client";

import { useId, useState } from "react";
import { WaitlistForm } from "./WaitlistForm";

// The waitlist, demoted (2026-09-02). Since 2026-08-30 the two lowest tiers
// are self-serve, so the page's primary ask is the free trial and a visitor
// who can start today should not be queued. The waitlist still matters — it
// feeds the founder's manual WhatsApp outreach — so it survives as a text
// link under the final CTA that mounts the existing form on demand. Two
// forms on one page read as pressure (the reason the 2026-08-25 mid-page form
// was cut the day it shipped); a link reads as a door.
//
// `source` is the waitlist row's origin tag. /features and the persona pages
// pass their own, so the growth dashboard keeps telling the pages apart the
// way it did when each mounted the form directly.
export function WaitlistDisclosure({
  source = "homepage_final_cta",
}: {
  source?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="flex w-full flex-col items-center">
      {open ? (
        <div id={panelId} className="w-full">
          <WaitlistForm source={source} />
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={false}
          aria-controls={panelId}
          onClick={() => setOpen(true)}
          className="cursor-pointer text-sm text-[var(--marketing-text-muted)] underline decoration-[color:var(--marketing-text-subtle)] underline-offset-4 transition-colors hover:text-[var(--marketing-text)] hover:decoration-[color:var(--marketing-text)]"
        >
          Not ready yet? Join the waitlist
        </button>
      )}
    </div>
  );
}
