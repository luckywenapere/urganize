import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass, wideContainerClass } from "./shared";

// Everything else a release needs, as tiles (2026-09-02). Each names a
// surface that is switched ON in production — press kit, shows with DJ packs,
// cover art and song files — and the trailing line covers the two that are
// live but did not earn a tile: playlist pitching (curators are invite-only,
// so a tile would imply a network a trial user may find empty) and the recap
// card. Files and Notes are off in production and are not mentioned anywhere.
//
// REMOVED 2026-09-03, the day after they were written: the founder switched
// the three scenes off in production (v1.21.0), and this page only advertises
// what is live. Each tile comes back with its flag; the copy is kept here so
// restoring one is a paste, not a rewrite:
//   Credits and metadata — "Collaborators fill in their credits and splits
//     through a link. Codes like ISRC and UPC are saved with the release."
//     (NEXT_PUBLIC_FEATURE_METADATA)
//   Content calendar — "Plan posts per platform, release by release. You
//     still post them." (NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR)
//   Fan page — "A fan gives an email and gets your link on the same screen.
//     The list is yours to export." (NEXT_PUBLIC_FEATURE_CAPTURE)
//   Shows and DJ packs — "Build a setlist timed to your slot and send the DJ
//     every track as one link. See when it was opened." (cut Oct 16, 2026,
//     URG-319; NEXT_PUBLIC_FEATURE_EVENTS)
// With six tiles the list ran two columns beside the phone; with three it
// runs one, so no tile sits alone on a half-empty row.
//
// No per-tile screenshots, on purpose: more image requests on metered mobile
// data for the beat a skimmer is most likely to skip. One shot, the public
// press kit on a phone — the outward-facing link competitors lack — stands
// for the whole group. That page is dark-locked, so one capture serves both
// themes.
// HOMEPAGE V2 (2026-10-17, URG-334): three rows, no cards and no screenshot.
// Each one serves the release or the gap before the next one. The old tiles
// (Press kit, Cover art and song files, the playlist-pitch and recap
// footnote and the press-kit phone capture) came off. The per-release EPK was
// switched off on 2026-10-17 (v1.154.15) and its kit lives inside Pitch this!
// now, so a "Press kit" tile described a surface that no longer stands alone.
// Only name scenes that are ON in production. The 2026-10-16 cut list
// (shows/setlists, audience, paid curator pitches, capture pages, release
// chat, content calendar, spend, UrgAns voice, MCP, notes) stays off this page.
// Copy rewritten 2026-10-17 for a cold visitor (Oyin): titles say what you
// get done, no feature names or jargon ("handoff", "metadata").
const ROWS = [
  {
    title: "Get heard by the people who pick songs.",
    body: "Pitch curators and Spotify and Apple Music editors right from the release, with your kit already attached.",
  },
  {
    title: "Never miss your distributor’s deadline again.",
    body: "The master, cover art and song details, each with an owner and a date. No last-week hunt for the WAV.",
  },
  {
    title: "Don’t let the hype die after drop day.",
    body: "Opportunities that fit your music, so the next move is ready before the buzz fades.",
  },
] as const;

export function FeatureGridSection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[72px] lg:py-[96px]"
        containerClassName={wideContainerClass}
      >
        <div className="mx-auto max-w-[52rem] text-center">
          <h2 className={centeredHeadlineClass}>The jobs that usually slip through the cracks.</h2>
        </div>

        <ul className="mx-auto mt-12 max-w-[56rem] border-t border-[color:var(--marketing-border)]">
          {ROWS.map((row) => (
            <li
              key={row.title}
              className="grid gap-1 border-b border-[color:var(--marketing-border)] py-6 sm:grid-cols-[18rem_1fr] sm:items-baseline sm:gap-8"
            >
              <h3 className="text-[1.2rem] leading-tight text-[var(--marketing-text)]">
                {row.title}
              </h3>
              <p className="text-[1rem] leading-7 text-[var(--marketing-text-muted)]">
                {row.body}
              </p>
            </li>
          ))}
        </ul>
      </SectionShell>
    </ScrollReveal>
  );
}
