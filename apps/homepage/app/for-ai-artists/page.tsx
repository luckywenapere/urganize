import type { Metadata } from "next";
import Link from "next/link";
import {
  PERSONA_HEADLINE_CLASS,
  PersonaValueBlocks,
} from "../components/landing/PersonaValueBlocks";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { WaitlistForm } from "../components/landing/WaitlistForm";
import { WorkspaceShotSection } from "../components/landing/sections/WorkspaceShotSection";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Urganize for AI artists",
  description:
    "Making the song got fast. The rollout did not. Urganize gives every drop the same 11-week plan, an owner on every activity and a press kit you send as one link.",
  path: "/for-ai-artists",
});

// POSITIONING NOTE — read before editing this page. The locked positioning
// (founder brief, 2026-08-19) is "the AI workspace for music executives
// working with ambitious artists", and it says artists are ecosystem
// advocates, never the addressee. This page addresses artists directly, so
// it is a deliberate exception the founder asked for (2026-08-21), not a
// drift — the same way /for-managers keeps speaking to managers after
// executives became the hero. Two guardrails keep it from undoing the
// brief: /for-executives is the hero page and leads the persona group in
// the ProductMenu, and this page speaks to the person RUNNING an AI artist
// project (releasing at volume), which is operator work, not fan-facing
// artist copy. If the brief is ever re-litigated, re-litigate this page
// with it.
//
// Honesty rule, and it bites hardest here: Urganize has NO AI-music
// feature. It does not make, master, tag or distribute anything, and the
// genre-prediction-from-audio work is flag-gated off in production. So this
// page never claims an AI capability. "AI artists" names the AUDIENCE and
// their problem — a release cadence far faster than a normal one — and
// every claim below is the same shipped plan, ownership, press kit and
// status machinery every other persona page describes.
//
// Language rules from the same brief: no "system of record", no container
// metaphors, fifth-grader readability, no Oxford comma.
const valueBlocks = [
  {
    kicker: "The plan",
    title: "The song took an afternoon. The rollout still takes weeks.",
    body: "Create a release and Urganize lays out the whole rollout. 64 activities across 11 weeks, from locking the master to pulling your first-week numbers. You did not have to think of any of it, and you can delete whatever does not apply to how you work.",
    points: [
      "One template, shaped for each release",
      "Every activity dated around that release day",
      "Edit or delete anything. It is your plan",
    ],
  },
  {
    kicker: "Your cadence",
    title: "Dropping in three weeks, not eleven?",
    body: "Set the date you actually have. Every activity is dated from release day, so a shorter runway moves the whole plan with it instead of leaving you a list of dates that already passed. Cut the activities that do not fit and keep the ones that do.",
    points: [
      "Move the release date and the plan moves with it",
      "Run several releases at once, each on its own plan",
      "Nothing assumes a label, a budget or a team of ten",
    ],
  },
] as const;

const compactBlocks = [
  {
    kicker: "Press kit",
    title: "You will be asked for a press kit. Have one.",
    body: "Urganize builds one from the release and keeps it current when the release changes. Send the same link to a blog, a curator or a booker instead of assembling a folder every time.",
  },
  {
    kicker: "Whoever helps",
    title: "A mixer, a designer, an editor.",
    body: "Give any activity an owner with a due date. They see what is theirs, and activities wait for each other so nothing starts before the step it needs is done.",
  },
  {
    kicker: "Status",
    title: "Know what is late before it is late.",
    body: "One workspace shows every release you have going: progress, what is overdue and what is due this week. Volume stops being the thing that breaks you.",
  },
] as const;

export default function ForAiArtistsPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--marketing-bg)] text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)] selection:text-[var(--marketing-text)]">
      <MarketingHeader />

      <main>
        {/* HERO */}
        <SectionShell
          className="pb-16 pt-16 sm:pt-20"
          containerClassName="max-w-[64rem] px-6 sm:px-8 lg:px-10"
        >
          <div className="mx-auto max-w-[46rem] text-center">
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              For AI artists
            </p>
            <h1 className="mt-8 text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem]">
              You can make a song in an hour.{" "}
              <span className="italic text-[var(--marketing-accent)]">
                Releasing one still takes weeks.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              AI changed how fast you can finish a track. It changed nothing
              about art, metadata, links, press and the people you need to
              tell. Urganize gives every drop the same plan, so putting out
              more music does not mean putting it out worse.
            </p>
            <div className="mt-8 flex w-full flex-col items-center gap-3">
              <WaitlistForm source="for_ai_artists_hero" />
            </div>
          </div>
        </SectionShell>

        {/* VALUE BLOCKS */}
        <PersonaValueBlocks blocks={valueBlocks} />

        {/* PRODUCT PROOF — the real workspace screenshots, same section the
            homepage and the other persona pages use. */}
        <WorkspaceShotSection />

        {/* THE REST, COMPACTED — same shape as /for-managers. */}
        <ScrollReveal>
          <SectionShell
            className="py-[60px] lg:py-[80px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto max-w-[64rem] border-t border-[color:var(--marketing-border)] pt-14">
              <p className="mono-label text-[var(--marketing-accent)]">
                Everything else
              </p>
              <h2 className={`mt-5 max-w-[40rem] ${PERSONA_HEADLINE_CLASS}`}>
                The press kit, your helpers and status come with it.
              </h2>

              <div className="mt-10 divide-y divide-[color:var(--marketing-border)]">
                {compactBlocks.map((item) => (
                  <div key={item.kicker} className="py-6">
                    <p className="mono-label text-[var(--marketing-text-subtle)]">
                      {item.kicker}
                    </p>
                    <p className="mt-3 max-w-[52rem] text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
                      <span className="font-medium text-[var(--marketing-text)]">
                        {item.title}
                      </span>{" "}
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* TO BE CLEAR — the honesty guardrail, same slot /for-labels uses
            for its founder-service-versus-UI clarification. Says plainly
            what this product does not do, because "for AI artists" invites
            exactly the wrong assumption. */}
        <ScrollReveal>
          <SectionShell
            className="py-[100px] lg:py-[120px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto max-w-[52rem] text-center">
              <p className="mono-label text-[var(--marketing-text-subtle)]">
                To be clear
              </p>
              <h2 className={`mt-6 ${PERSONA_HEADLINE_CLASS}`}>
                Urganize does not make the music.
              </h2>
              <p className="mx-auto mt-6 max-w-[38rem] text-balance text-base leading-8 text-[var(--marketing-text-muted)]">
                Keep whatever you use to write, generate, mix and master. Keep
                your distributor. Urganize is the part after that: the plan,
                who is doing what and where every release stands.
              </p>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* FINAL CTA — no ProofLine: every quote on the site is from a
            manager or an A&R, and none of them is an AI artist. We do not
            borrow proof from an audience that did not give it. */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={PERSONA_HEADLINE_CLASS}>
                Release fast without releasing messy.
              </h2>
              <p className="mx-auto mt-6 max-w-[32rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
                Start with a 14-day free trial, and we set up every artist
                personally. See{" "}
                <Link
                  href="/pricing"
                  className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
                >
                  how that works
                </Link>
                .
              </p>
              <div className="mt-10 flex w-full flex-col items-center gap-3">
                <WaitlistForm source="for_ai_artists_cta" />
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
            Running other people&apos;s releases too?{" "}
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
