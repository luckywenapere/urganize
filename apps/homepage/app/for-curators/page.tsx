import type { Metadata } from "next";
import Link from "next/link";
import {
  PERSONA_HEADLINE_CLASS,
  PersonaValueBlocks,
} from "../components/landing/PersonaValueBlocks";
import { ResponsiveProductShot } from "../components/landing/ResponsiveProductShot";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { APP_CURATOR_APPLY_URL } from "@/lib/app-urls";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";
import type { ProductShot } from "@/content/product-shots";

export const metadata: Metadata = buildPageMetadata({
  title: "A free song pitch inbox for playlist curators",
  description:
    "One inbox for the songs artists pitch you, inside the planning and coordination app they already use. Answer each in one tap. Free for playlist curators.",
  path: "/for-curators",
  shareCard: "for-curators",
});

// Honesty rule, and this page needs it more than most: playlist pitching is
// BUILT (see the 2026-08-10 playlist-pitching section in CLAUDE.md) but sits
// behind NEXT_PUBLIC_FEATURE_PITCHING, which is off in production. So every
// claim below is written against the shipped code AND the page's only ask is
// the waitlist — it never says "sign up now" or implies self-serve access.
// Curator accounts are genuinely invite-only by design (the founder mints
// links at /admin/curator-invites and nothing is emailed automatically), so
// "leave your details and we send you a link" is the real path, not a
// softener. When the flag flips, this page needs no rewrite.
//
// Every number and label here comes from apps/web/lib/pitching.ts, which is
// the shared source of truth for both the pitching UI and its API routes:
// MAX_PITCH_NOTE_LENGTH (300), MAX_PITCH_REPLY_LENGTH (200),
// MAX_WAITING_PITCHES_PER_RELEASE (10), PITCH_PLATFORM_LABELS and
// PITCH_STATUS_LABELS. If any of those move, move this copy with them.
//
// Language rules (founder brief, 2026-09-09): never "workspace", never
// "ship", no "system of record", fifth-grader readability, no Oxford comma.
// The 2026-08-19 ban on container metaphors is the one rule that flipped:
// "from one place" is the product's own promise now.
const valueBlocks = [
  {
    kicker: "The inbox",
    title: "One inbox, not four.",
    body: "Right now songs reach you in DMs, email and a few group chats, and the good ones get buried under the rest. A curator account gives you one inbox. Each pitch shows the song, a link you can play and a note of 300 characters at most, because whoever sent it had to keep it short.",
    points: [
      "The song, the link and a short note. Nothing else to dig through",
      "Teams cannot flood you. A release can only have ten pitches waiting on a reply",
      "Free for curators. There is no plan to buy",
    ],
  },
  {
    kicker: "Your answer",
    title: "One tap, and they stop asking.",
    body: "Mark a pitch Listened when you have heard it, then Added or Passed when you decide. You can send back one line with either, up to 200 characters. The team sees your answer on their release, so nobody has to follow up in your DMs to find out what happened.",
    points: [
      "New, Listened, Added or Passed",
      "One line back if you want to say why. Never required",
      "No thread, no chat, no reply-all",
    ],
  },
  {
    kicker: "Your playlists",
    title: "You list them. Nothing connects to them.",
    body: "Add each playlist with its name, its link, the platform it lives on and the genres you actually take. Urganize never touches the playlist itself. There is no Spotify or Apple Music connection anywhere in this, so adding a song stays your job and your call, exactly the way it works today.",
    points: [
      "Spotify, Apple Music, Audiomack, YouTube or anywhere else",
      "Up to ten genre tags per playlist, so you get sent the right songs",
      "Follower count is yours to enter, and yours to leave blank",
    ],
  },
  {
    kicker: "Your privacy",
    title: "You see pitches. You see nothing else.",
    body: "A curator account is walled off from the teams that pitch you. You cannot see their releases, their tasks or their team, and they cannot see your other pitches. That is enforced in the database itself, not just hidden in the screens.",
    points: [
      "No team can read your inbox",
      "No other curator can see your playlists",
      "Want to run your own releases too? The same login does both",
    ],
  },
] as const;

// The curator inbox still (#959, mock approved by the founder 2026-11-01).
// It is a drawn picture, not a capture: the pitching flag is off in
// production, so there is no live curator screen to photograph. Fictional
// artist (Tobi Rayne), drawn in the app's light and dark tokens so it follows
// the site's theme toggle. The labels in it are the shipped ones from the
// curator inbox; if that screen changes, redraw both.
const curatorInbox: ProductShot = {
  light: "/images/product/curator-inbox.webp",
  dark: "/images/product/curator-inbox-dark.webp",
  width: 2000,
  height: 1320,
};
const curatorInboxPhone: ProductShot = {
  light: "/images/product/curator-inbox-phone.webp",
  dark: "/images/product/curator-inbox-phone-dark.webp",
  width: 716,
  height: 1660,
};

// Real product data rendered as type: the four actual statuses from
// PITCH_STATUSES, in the product's own order. The still under the hero shows
// one pitch; this block shows the whole set of answers.
const pitchStatuses = [
  { label: "New", note: "It just landed" },
  { label: "Listened", note: "You heard it" },
  { label: "Added", note: "It is in the playlist" },
  { label: "Passed", note: "Not this one" },
] as const;

export default function ForCuratorsPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--marketing-bg)] text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)] selection:text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="isolate overflow-x-clip">
        {/* HERO */}
        <SectionShell
          className="pb-16 pt-16 sm:pt-20"
          containerClassName="max-w-[64rem] px-6 sm:px-8 lg:px-10"
        >
          <PageDawn className="mx-auto max-w-[46rem] text-center">
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              For playlist curators
            </p>
            <h1 className="mt-8 text-balance text-[2.25rem] leading-[1.06] text-[var(--marketing-text)] sm:text-[3.6rem]">
              People pitch you all day.{" "}
              <span className="text-[var(--marketing-accent)]">
                Answer in one tap.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              You run the playlist. That means a DM every hour, a link with no
              context and someone asking again three days later. Urganize
              gives you one inbox for pitches and one tap to answer. It is
              free for curators, and your playlist stays yours.
            </p>
            <div className="mt-8 flex w-full flex-col items-center gap-3">
              {/* The curator application form in the app (#1220). It used to be
                  the waitlist form, from before /curator/apply existed. */}
              <a
                href={APP_CURATOR_APPLY_URL}
                data-track="curator_apply_click"
                data-location="for_curators_hero"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--marketing-primary)] px-8 py-4 text-base font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] transition-colors hover:bg-[var(--marketing-primary-hover)] sm:w-auto"
              >
                Apply as a curator
              </a>
              <p className="text-sm leading-6 text-[var(--marketing-text-subtle)]">
                We read every application and reply within a week.
              </p>
            </div>
          </PageDawn>
        </SectionShell>

        {/* THE INBOX — the approved curator still. Phone picture below sm,
            the wide one from sm up (ResponsiveProductShot picks one). */}
        <SectionShell
          className="pb-8 pt-0 sm:pb-12 sm:pt-0 lg:pb-16 lg:pt-0"
          containerClassName="max-w-[64rem] px-6 sm:px-8 lg:px-10"
        >
          <div className="mx-auto max-w-[24rem] sm:max-w-none">
            <ResponsiveProductShot
              desktop={curatorInbox}
              phone={curatorInboxPhone}
              alt="A curator's Pitches inbox in Urganize: a pitch for Slow Burn by Tobi Rayne with a short note and a press kit link, a Listen on Spotify button, Add it and Pass buttons, and the artist's press kit open with it."
              sizes="(min-width: 1024px) 944px, calc(100vw - 64px)"
              fetchPriority="auto"
            />
          </div>
        </SectionShell>

        {/* VALUE BLOCKS */}
        <PersonaValueBlocks blocks={valueBlocks} />

        {/* THE FOUR ANSWERS — real product data as type. See the
            pitchStatuses comment. */}
        <ScrollReveal>
          <SectionShell
            className="py-[60px] lg:py-[80px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto max-w-[52rem] border-t border-[color:var(--marketing-border)] pt-14 text-center">
              <p className="mono-label text-[var(--marketing-text-subtle)]">
                The whole vocabulary
              </p>
              <h2 className={`mt-6 ${PERSONA_HEADLINE_CLASS}`}>
                Four answers. That is the entire job.
              </h2>
            </div>

            <div className="mx-auto mt-14 grid max-w-[60rem] grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2 lg:grid-cols-4">
              {pitchStatuses.map((status) => (
                <div
                  key={status.label}
                  className="bg-[var(--marketing-bg)] px-6 py-7 text-left sm:px-7 sm:py-8"
                >
                  <p className="font-mono text-[0.78rem] uppercase tracking-[0.16em] text-[var(--marketing-accent)]">
                    {status.label}
                  </p>
                  <p className="mt-3 text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
                    {status.note}
                  </p>
                </div>
              ))}
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* FINAL CTA — no ProofLine here: every quote on this site is from a
            manager or an A&R, and putting one under a curator's CTA would be
            proof from the wrong side of the pitch. */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={PERSONA_HEADLINE_CLASS}>
                Apply to curate on Urganize.
              </h2>
              <p className="mx-auto mt-6 max-w-[32rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
                Free for curators, and we set every curator up personally. Tell
                us where your playlists live and we will reply within a week.
              </p>
              <div className="mt-10 flex w-full flex-col items-center gap-3">
                <a
                  href={APP_CURATOR_APPLY_URL}
                  data-track="curator_apply_click"
                  data-location="for_curators_cta"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--marketing-primary)] px-8 py-4 text-base font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] transition-colors hover:bg-[var(--marketing-primary-hover)] sm:w-auto"
                >
                  Apply as a curator
                </a>
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* CROSS-LINK */}
        <SectionShell
          className="pb-20 pt-0"
          containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
        >
          <p className="text-center text-sm text-[var(--marketing-text-subtle)]">
            Pitching songs rather than receiving them?{" "}
            <Link
              href="/for-managers"
              className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
            >
              See Urganize for managers
            </Link>
            .
          </p>
        </SectionShell>
      </main>

      <MarketingFooter />
    </div>
  );
}
