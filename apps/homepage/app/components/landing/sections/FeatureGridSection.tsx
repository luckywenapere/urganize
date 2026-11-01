import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { FeatureBentoPlay } from "./FeatureBentoPlay";
import { HandoffPicture, OpportunityPicture, PitchPicture } from "./FeatureBentoPictures";
import { centeredHeadlineClass, wideContainerClass } from "./shared";
import "./feature-bento.css";

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
// HOMEPAGE V2 (2026-10-17, URG-334): three rows, no cards and no screenshot
// (cards came back as the bento on 2026-11-01, below).
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
//
// THE BENTO (2026-11-01, #954, founder approved mock v3). The three rows
// became tiles, each with a small picture of the app drawn in HTML and SVG
// (FeatureBentoPictures.tsx): still no image requests, so the rule above
// stands. The pitching tile is the big one. Each tile plays one beat once as
// it scrolls in (FeatureBentoPlay.tsx, a few hundred bytes, no Stageshow);
// the end state is the server-rendered default, so no script or reduced
// motion shows the finished story. Titles stay h3s, run in with their line.
// The deadline line dropped "The master" (approved 2026-11-01): the app only
// takes cover art and song details now. Styles in feature-bento.css.
const TILES = [
  {
    className: "fb-tile fb-hero",
    title: "Get heard by the people who pick songs.",
    body: "Pitch curators and Spotify and Apple Music editors right from the release, with your kit already attached.",
    picture: <PitchPicture />,
  },
  {
    className: "fb-tile",
    title: "Never miss your distributor’s deadline again.",
    body: "Cover art and song details, each with an owner and a date. No last-week hunt for the WAV.",
    picture: <HandoffPicture />,
  },
  {
    className: "fb-tile fb-opp",
    title: "Don’t let the hype die after drop day.",
    body: "Opportunities that fit your music, so the next move is ready before the buzz fades.",
    picture: <OpportunityPicture />,
  },
];

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

        <div className="fb">
          <FeatureBentoPlay className="fb-grid">
            {TILES.map((tile) => (
              <li key={tile.title} className={tile.className}>
                <div className="fb-copy">
                  <h3>{tile.title}</h3> {tile.body}
                </div>
                <div className="fb-pic" aria-hidden="true">
                  {tile.picture}
                </div>
              </li>
            ))}
          </FeatureBentoPlay>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
