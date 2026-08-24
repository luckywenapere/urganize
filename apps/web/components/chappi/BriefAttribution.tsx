'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  TEAM_BRIEF_SECTION_META,
  isTeamBriefSection,
  type TeamBriefSection,
} from '@/lib/team-brief';

/**
 * Phase 4 attribution: what UrgAns had from the team brief when it answered.
 *
 * ── The claim this makes, and the one it deliberately does not ──────────────
 * The spec asks for a marker "when an answer was materially shaped by the
 * brief". That is not detectable. The only ways to know would be to ask the
 * model to self-report, which is unreliable and would put a confession in
 * every reply, or to diff the answer's wording against the brief's, which any
 * paraphrase defeats. Either produces a marker that appears and disappears
 * for reasons a user cannot predict — worse than one that is honest and
 * consistent.
 *
 * So this reports what was IN CONTEXT, and says so: "Read your team brief",
 * not "shaped by your team brief". A user who expands it sees which sections
 * UrgAns was working from and can judge the answer against them, which is the
 * thing attribution is actually for.
 *
 * Collapsed by default and quiet by design — it appears under every answer in
 * a team with a filled brief, so anything louder would become wallpaper.
 */

type BriefAttributionProps = {
  /** Raw section keys off the API response — validated here rather than
   *  trusted, since an unknown key would render as a blank bullet. */
  sections: string[];
};

export function BriefAttribution({ sections }: BriefAttributionProps) {
  const [open, setOpen] = useState(false);

  const known: TeamBriefSection[] = sections.filter(isTeamBriefSection);
  if (!known.length) return null;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="motion-focus inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-secondary"
      >
        <ChevronRight
          className={`h-2.5 w-2.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        Read your team brief
      </button>

      {open ? (
        <ul className="mt-1 space-y-0.5 pl-4">
          {known.map((section) => (
            <li key={section} className="text-[11px] text-content-tertiary">
              {TEAM_BRIEF_SECTION_META[section].label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
