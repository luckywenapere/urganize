import { PRODUCT_SHOTS } from "@/content/product-shots";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { ThemedProductShot } from "../ThemedProductShot";
import { centeredHeadlineClass, wideContainerClass } from "./shared";

// Everything else a release needs, as six tiles (2026-09-02). Each names a
// surface that is switched ON in production as of this date — press kit,
// credits link, content calendar, fan page, shows with DJ packs, cover art
// and song files — and the trailing line covers the two that are live but
// did not earn a tile: playlist pitching (curators are invite-only, so a tile
// would imply a network a trial user may find empty) and the recap card.
// Files and Notes are off in production and are not mentioned anywhere.
//
// No per-tile screenshots, on purpose: six more image requests on metered
// mobile data for the beat a skimmer is most likely to skip. One shot, the
// public press kit on a phone — the outward-facing link competitors lack —
// stands for the whole group. That page is dark-locked, so one capture
// serves both themes.
const TILES = [
  {
    title: "Press kit",
    body: "One link for press, curators and bookers. It updates when the release changes.",
  },
  {
    title: "Credits and metadata",
    body: "Collaborators fill in their credits and splits through a link. Codes like ISRC and UPC are saved with the release.",
  },
  {
    title: "Content calendar",
    body: "Plan posts per platform, release by release. You still post them.",
  },
  {
    title: "Fan page",
    body: "A fan gives an email and gets your link on the same screen. The list is yours to export.",
  },
  {
    title: "Shows and DJ packs",
    body: "Build a setlist timed to your slot and send the DJ every track as one link. See when it was opened.",
  },
  {
    title: "Cover art and song files",
    body: "Cover art is checked against streaming platforms' rules. Upload the master once and share it from the release.",
  },
] as const;

export function FeatureGridSection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[80px] lg:py-[100px]"
        containerClassName={wideContainerClass}
      >
        <div className="mx-auto max-w-[52rem] text-center">
          <h2 className={centeredHeadlineClass}>Everything a release needs.</h2>
        </div>

        <div className="mx-auto mt-14 grid max-w-[74rem] items-start gap-10 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-14">
          <div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {TILES.map((tile) => (
                <li
                  key={tile.title}
                  className="rounded-[1.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6"
                >
                  <h3 className="text-[1.15rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--marketing-text)]">
                    {tile.title}
                  </h3>
                  <p className="mt-3 text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
                    {tile.body}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-8 max-w-[44rem] text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
              Plus playlist pitches you can track as the curator listens, adds
              or passes. And a recap card to share when the release is out.
            </p>
          </div>

          <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-[1.5rem] border border-[color:var(--marketing-border)]">
            <ThemedProductShot
              {...PRODUCT_SHOTS.epkPhone}
              alt="A press kit made in Urganize, open on a phone: cover art, the artist, the release and its date on one public page."
              sizes="260px"
            />
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
