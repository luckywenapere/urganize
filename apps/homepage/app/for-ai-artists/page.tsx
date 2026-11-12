import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PERSONA_HEADLINE_CLASS,
  PersonaValueBlocks,
} from "../components/landing/PersonaValueBlocks";
import { ResponsiveProductShot } from "../components/landing/ResponsiveProductShot";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { TrialButton } from "../components/landing/TrialButton";
import { WorkspaceShotSection } from "../components/landing/sections/WorkspaceShotSection";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";
import type { ProductShot } from "@/content/product-shots";
import { PRIMARY_CTA } from "@/lib/app-urls";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Release planning for AI artists",
    description:
      "Making the song got fast. The rollout did not. Tell Urganize your goals and get a plan that fits, or make your own, with an owner on every activity.",
    path: "/for-ai-artists",
    shareCard: "for-ai-artists",
  }),
  robots: { index: false, follow: false },
};

// REMOVED FROM THE SITE 2026-10-18 (founder call, URG-385): hidden, not
// deleted. The page 404s unless NEXT_PUBLIC_FEATURE_AI_ARTISTS_PAGE is "true"
// (unset in production; same flag-gate posture as /roadmap), is noindexed,
// and has no entry point anywhere: not in sitemap.ts, ProductMenu, the
// footer or any page's links. The code stays so it can come back with a flag
// flip; delete it only with the founder's OK after 60 days with no asks.
const AI_ARTISTS_PAGE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_AI_ARTISTS_PAGE === "true";

// POSITIONING NOTE, and it is shorter than it used to be. Under the
// 2026-08-19 brief this page needed defending: that positioning made
// executives the hero and called artists ecosystem advocates rather than the
// addressee, so a page speaking to artists directly was a founder-sanctioned
// exception (2026-08-21). The 2026-09-09 positioning retired the exception
// entirely, and the 2026-09-24 one keeps it retired: the audience is artists,
// managers and labels, in that order, with artists FIRST. This page is
// squarely on-brief rather than a tolerated
// edge. It still speaks to the person RUNNING an AI artist project, which is
// operator work rather than fan-facing artist copy.
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
    body: "Urganize asks about your goals and makes a plan that fits: 64 activities for a single, 90 for an EP, 113 for an album. Or make your own, and delete whatever does not apply to how you work.",
    points: [
      "A plan shaped to your goals, or your own",
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
      "Run several rollouts at once, each on its own plan",
      "Nothing assumes a label, a budget or a team of ten",
    ],
  },
] as const;

const compactBlocks = [
  {
    kicker: "Press kit",
    title: "You will be asked for a press kit. Have one.",
    body: "You get a press kit with its own link, and it goes along with every pitch you send to a curator.",
  },
  {
    kicker: "Feedback",
    title: "See what worked.",
    body: "After every task, Urganize asks how it went, so you can see what worked when the release is out.",
  },
  {
    kicker: "Whoever helps",
    title: "A mixer, a designer, an editor.",
    body: "Give any activity an owner with a due date. They see what is theirs, and activities wait for each other so nothing starts before the step it needs is done.",
  },
  {
    kicker: "Status",
    title: "Know what is late before it is late.",
    body: "One list shows every rollout you have going: progress, what is overdue and what is due this week. Volume stops being the thing that breaks you.",
  },
] as const;

// The rollouts still (#960, mock approved by the founder 2026-11-01). A drawn
// picture, not a capture: a rollout with a three-week runway (today at W3, an
// owner on each activity) behind the rollouts list with what is late and what
// is due. Fictional artists, drawn in the app's light and dark tokens so it
// follows the site's theme toggle. If the timeline or the rollouts list
// changes in the app, redraw both pairs.
const rolloutsShot: ProductShot = {
  light: "/images/product/ai-artists-rollouts.webp",
  dark: "/images/product/ai-artists-rollouts-dark.webp",
  width: 2000,
  height: 1150,
};
const rolloutsShotPhone: ProductShot = {
  light: "/images/product/ai-artists-rollouts-phone.webp",
  dark: "/images/product/ai-artists-rollouts-phone-dark.webp",
  width: 716,
  height: 920,
};

export default function ForAiArtistsPage() {
  if (!AI_ARTISTS_PAGE_ENABLED) {
    notFound();
  }

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
              For AI artists
            </p>
            <h1 className="mt-8 text-balance text-[2.25rem] leading-[1.06] text-[var(--marketing-text)] sm:text-[3.6rem]">
              You can make a song in an hour.{" "}
              <span className="text-[var(--marketing-accent)]">
                Releasing one still takes weeks.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              AI changed how fast you can finish a track. It changed nothing
              about art, metadata, links, press and the people you need to
              tell. Urganize gives every drop the same plan, so putting out
              more music does not mean putting it out worse.
            </p>
            {/* Since the 2026-09-02 homepage overhaul the ask is the free
                trial, the same TrialButton the homepage mounts; the waitlist
                survives as a disclosure under the final CTA. */}
            <div className="mt-8 flex w-full flex-col items-center gap-4">
              <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
                <TrialButton location="for_ai_artists_hero" size="lg" className="w-full sm:w-auto" />
                {/* A second option for a visitor not ready to sign up (#1220). */}
                <Link
                  href="/pricing"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[color:var(--marketing-border-strong)] px-7 py-4 text-base font-medium tracking-[-0.02em] text-[var(--marketing-text)] transition-colors hover:bg-[var(--marketing-surface-muted)] sm:w-auto"
                >
                  See pricing
                </Link>
              </div>
              <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
                {PRIMARY_CTA.note}
              </p>
            </div>
          </PageDawn>
        </SectionShell>

        {/* THE ROLLOUTS — the approved still. Phone picture below sm, the
            wide one from sm up (ResponsiveProductShot picks one). */}
        <SectionShell
          className="pb-8 pt-0 sm:pb-12 sm:pt-0 lg:pb-16 lg:pt-0"
          containerClassName="max-w-[64rem] px-6 sm:px-8 lg:px-10"
        >
          <div className="mx-auto max-w-[24rem] overflow-hidden rounded-2xl border border-[color:var(--marketing-border)] sm:max-w-none">
            <ResponsiveProductShot
              desktop={rolloutsShot}
              phone={rolloutsShotPhone}
              alt="A rollout in Urganize for Night Swim by Vela Nine, out Friday 20 November: a week-by-week timeline with today three weeks out, an owner on each activity, and in front the rollouts list showing Night Swim in 19 days, Paper Moons with 2 late and Low Tide with 3 due this week."
              sizes="(min-width: 1024px) 944px, calc(100vw - 64px)"
              fetchPriority="auto"
            />
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
                A press kit, your helpers, status and feedback come with it.
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

        {/* TO BE CLEAR — the honesty guardrail, the slot the retired
            /for-labels page used for its founder-service-versus-UI
            clarification. Says plainly
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
                Keep whatever you use to make music. Urganize plans the release
                and keeps track of every task.
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
                Create your account and pick the plan that fits. See{" "}
                <Link
                  href="/pricing"
                  className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
                >
                  how that works
                </Link>
                .
              </p>
              <div className="mt-10 flex w-full flex-col items-center gap-4">
                <TrialButton location="for_ai_artists_cta" size="lg" className="w-full sm:w-auto" />
                <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
                  {PRIMARY_CTA.note}
                </p>
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
            Running other people&apos;s rollouts too?{" "}
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
