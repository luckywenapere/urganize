import Image from "next/image";
import Link from "next/link";
import { ScrollReveal } from "./ScrollReveal";
import { SectionShell } from "./SectionShell";

const APP_AUTH_URL = "https://app.urganize.app/auth";

const featureColumns = [
  {
    kicker: "Workflow",
    title: "Release tasks, assigned.",
    body: "Every step from master lock to release day, owned by a person with a due date. No more 'who's doing the art again?'",
  },
  {
    kicker: "Assets",
    title: "Every file, filed.",
    body: "Masters, artwork, contracts, and split sheets, attached to the release they belong to. No more 'Final v3 ACTUAL final' buried in Drive.",
  },
  {
    kicker: "Visibility",
    title: "Status at a glance.",
    body: "One workspace shows every release in flight: what's done, what's blocked, what's due this week. Spot what's slipping before it hurts the rollout.",
  },
] as const;

const fourTools = [
  { num: "01", name: "WhatsApp", note: "group chats, voice notes, files" },
  { num: "02", name: "Google Drive", note: "stems, art, versioned by hope" },
  { num: "03", name: "Asana / Notion", note: "half-built templates" },
  { num: "04", name: "Memory", note: "or nothing at all" },
] as const;

// Real rows from the single-release template (single_v0.3 — 64 tasks across
// 11 weeks, signed off by two design partners). Keep these verbatim from
// apps/web/lib/release-templates/single.ts so the marketing never drifts
// from the product again.
const templateExcerpt = [
  { week: "WK −8", title: "Lock the master file" },
  { week: "WK −8", title: "Confirm release date and lock it" },
  { week: "WK −7", title: "Brief designer on cover art" },
  { week: "WK −6", title: "Draft split sheet and circulate to all contributors" },
  { week: "WK −5", title: "Upload track and metadata to distributor" },
  { week: "WK −4", title: "Submit Spotify for Artists pitch" },
  { week: "DROP", title: "Release day: monitor distributor for go-live across all DSPs" },
  { week: "WK +1", title: "Compile first-week stats: streams, saves, playlist adds" },
] as const;

const wideContainerClass = "max-w-[84rem] px-6 sm:px-8 lg:px-10";

const solidButtonClassName =
  "relative z-[60] inline-flex cursor-pointer touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] sm:text-base";

const centeredHeadlineClass =
  "text-balance text-[3rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem] lg:text-[5rem]";

const mutedLeadClass =
  "text-balance text-[clamp(1.1rem,2vw,1.4rem)] leading-8 text-[var(--marketing-text-muted)]";

function LogoStrip({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={className}>
      {/* w-fit on the inner row makes mx-auto center the VISIBLE content
          (text + gap + logo), not the reserved max-w. Without it, the
          right-aligned text leaves invisible whitespace on its left, which
          visually offsets the whole block to the right. */}
      <div className="mx-auto flex flex-col items-center gap-6 sm:w-fit sm:flex-row sm:gap-8">
        <p className="max-w-[28rem] text-balance text-center font-mono text-[0.82rem] leading-6 tracking-[0.02em] text-[var(--marketing-text-subtle)] sm:text-right sm:text-[0.9rem]">
          Trusted by Creative Business Academy.
        </p>
        <Image
          src="/images/logos/anchor-partner.png"
          alt="Creative Business Academy"
          width={97}
          height={40}
          className="h-12 w-auto shrink-0 opacity-90 sm:h-14"
        />
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <SectionShell
      className="pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24"
      containerClassName={wideContainerClass}
    >
      <div className="mx-auto flex max-w-[64rem] flex-col items-center text-center">
        <p className="hero-fade-in mono-label text-[var(--marketing-text-subtle)]">
          Labels and artist managers
        </p>

        <div className="mt-8 flex flex-col items-center gap-8 sm:gap-10">
          <h1 className="hero-fade-in hero-delay-1 mx-auto max-w-[22ch] text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.4rem] lg:text-[5.6rem]">
            Stop running releases out of{" "}
            <span className="italic text-[var(--marketing-accent)]">
              WhatsApp threads
            </span>{" "}
            and{" "}
            <span className="italic text-[var(--marketing-accent)]">
              scattered notes
            </span>
            .
          </h1>

          <p className="hero-fade-in hero-delay-2 mx-auto block w-full max-w-[44rem] text-balance text-center text-lg leading-8 text-[var(--marketing-text-muted)] sm:text-[1.25rem] sm:leading-9">
            One workspace for the whole release: a hand-crafted rollout plan,
            tasks your freelance team actually owns, and every file where it
            belongs.
          </p>
        </div>

        <div className="hero-fade-in hero-delay-3 relative z-[60] mt-8 flex flex-col items-center gap-3">
          <Link href={APP_AUTH_URL} className={solidButtonClassName}>
            Start free for 28 days
          </Link>
          <p className="font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
            NO CARD REQUIRED
          </p>
        </div>

        <LogoStrip className="hero-fade-in hero-delay-3 mt-12 w-full sm:mt-14" />
      </div>

      <ScrollReveal>
        <div className="mx-auto mt-14 w-full max-w-4xl sm:mt-16">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl">
            <iframe
              className="absolute inset-0 h-full w-full"
              src="https://www.youtube.com/embed/nfOjPlmDpFw?start=10"
              title="Urganize product walkthrough"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </ScrollReveal>
    </SectionShell>
  );
}

export function MirrorSection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[100px] lg:py-[140px]"
        containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
      >
        <div className="mx-auto flex w-full flex-col items-center text-center">
          <h2 className={`mx-auto max-w-[52rem] ${centeredHeadlineClass}`}>
            Most teams run releases across WhatsApp, Drive, Asana, and Notion,
            or no system at all.
          </h2>

          <div className="mt-14 grid w-full max-w-[60rem] grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2 lg:grid-cols-4">
            {fourTools.map((tool) => (
              <div
                key={tool.num}
                className="bg-[var(--marketing-bg)] px-6 py-7 text-left sm:px-7 sm:py-8"
              >
                <p className="font-mono text-[0.72rem] font-medium tracking-[0.16em] text-[var(--marketing-accent)]">
                  {tool.num}
                </p>
                <p className="mt-3 font-mono text-[0.95rem] font-semibold uppercase tracking-[0.06em] text-[var(--marketing-text)]">
                  {tool.name}
                </p>
                <p className="mt-2 font-mono text-[0.78rem] italic tracking-[0.02em] text-[var(--marketing-text-subtle)]">
                  {tool.note}
                </p>
              </div>
            ))}
          </div>

          <p className={`mx-auto mt-14 block w-full max-w-[40rem] text-center ${mutedLeadClass}`}>
            Urganize replaces all of that with one structured workspace your
            entire team can actually use.
          </p>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

// Real screenshot of the current workspace (staged 2026-06-11). If the UI
// changes meaningfully, retake this — never let marketing imagery lag the
// product again.
export function WorkspaceShotSection() {
  return (
    <ScrollReveal>
      <SectionShell
        containerClassName={wideContainerClass}
        className="py-[60px] lg:py-[80px]"
      >
        <p className="mono-label mb-10 text-center text-[var(--marketing-text-subtle)]">
          Live since January 2026
        </p>
        <div className="overflow-hidden rounded-xl border border-[color:var(--marketing-border)]">
          <Image
            src="/images/product/workspace-releases.png"
            alt="The Urganize workspace: four releases in flight, each with artist, release date, and task progress toward its 64-task plan."
            width={1918}
            height={974}
            className="h-auto w-full"
            sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw"
          />
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

// The honest centerpiece: the hand-crafted release template is the product's
// real IP, so show it — actual rows, rendered as type, not a screenshot of
// a retired UI.
export function TemplatePlanSection() {
  return (
    <ScrollReveal>
      <SectionShell containerClassName="max-w-[64rem] px-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[52rem] text-center">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            The playbook
          </p>

          <h2 className={`mt-6 ${centeredHeadlineClass}`}>
            Every release starts with a plan. Yours has 64 tasks.
          </h2>

          <p className={`mx-auto mt-8 max-w-[40rem] ${mutedLeadClass}`}>
            Create a release and Urganize lays out an 11-week rollout,
            hand-crafted with working managers, owned task by task by your
            team, and fully yours to edit.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-[44rem] border-y border-[color:var(--marketing-border)]">
          {templateExcerpt.map((row) => (
            <div
              key={`${row.week}-${row.title}`}
              className="flex items-baseline gap-5 border-b border-[color:var(--marketing-border)] py-4 last:border-b-0 sm:gap-8"
            >
              <p className="w-14 shrink-0 text-right font-mono text-[0.72rem] tracking-[0.12em] text-[var(--marketing-accent)] sm:w-16">
                {row.week}
              </p>
              <p className="text-[0.95rem] leading-6 text-[var(--marketing-text)] sm:text-base">
                {row.title}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
          + 56 MORE, GENERATED THE MOMENT YOU CREATE A RELEASE
        </p>

        <div className="mx-auto mt-14 max-w-[58rem] overflow-hidden rounded-xl border border-[color:var(--marketing-border)]">
          <Image
            src="/images/product/workspace-tasks.png"
            alt="Tasks scoped to the release 'Born To Be Free', fresh from its 64-task plan, with owners and due dates on every row."
            width={1918}
            height={972}
            className="h-auto w-full"
            sizes="(min-width: 1024px) 928px, 100vw"
          />
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

export function ThreeFeaturesSection() {
  return (
    <ScrollReveal>
      <SectionShell containerClassName={wideContainerClass}>
        <div className="grid divide-y divide-[color:var(--marketing-border)] border-y border-[color:var(--marketing-border)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {featureColumns.map((feature) => (
            <div key={feature.title} className="py-10 lg:px-10 lg:py-14">
              <p className="mono-label text-[var(--marketing-accent)]">
                {feature.kicker}
              </p>
              <h3 className="mt-5 text-balance text-[2.15rem] font-semibold leading-[1.04] tracking-[-0.045em] text-[var(--marketing-text)] sm:text-[2.6rem]">
                {feature.title}
              </h3>
              <p className="mt-5 max-w-[24rem] text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

// Same rule as the @zaddyfunds_ hero quote below: a testimonial only works
// because the words are really theirs. These are DRAFTS — get verbatim
// sign-off from Antoine, Adenaiye and Tamuno-Tekena before this ships, and
// never edit a quote after sign-off without re-approval.
const supportingQuotes = [
  {
    quote:
      "I manage myself, so every dropped ball is mine. The first time I created a release, the whole rollout was already laid out, week by week, task by task. I stopped planning from memory.",
    name: "Antoine",
    role: "Artist Manager",
  },
  {
    quote:
      "The master, the artwork, the split sheet, they all live on the release now instead of buried in three different chats. When my artist needs a file, I know exactly where it is.",
    name: "Adenaiye Miracle",
    role: "Artist Manager",
  },
  {
    quote:
      "I open a release and see what's done, what's blocked and what's due this week, without chasing anyone for an update. That's a call I don't have to make anymore.",
    name: "Tamuno-Tekena Ayafa",
    role: "A&R",
  },
] as const;

export function TestimonialSection() {
  return (
    <ScrollReveal>
      <SectionShell containerClassName={wideContainerClass}>
        <div className="mx-auto max-w-[54rem] text-center">
          <blockquote className="relative pt-20 before:absolute before:left-1/2 before:top-0 before:-translate-x-1/2 before:font-display before:text-[7rem] before:leading-none before:text-[var(--marketing-text-subtle)] before:content-['“'] sm:before:text-[8.5rem]">
            <p className="text-balance font-display text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[3.8rem] lg:text-[4.4rem]">
              This solves an actual problem in the industry.
            </p>
          </blockquote>

          {/* Hero quote is verbatim from @zaddyfunds_ (a different person
              from Adenaiye Miracle, who has her own card below); handle used
              with permission. Never edit the quote text without their
              sign-off — a testimonial only works because the words are
              really theirs. */}
          <p className="mt-10 font-mono text-[0.8rem] tracking-[0.18em] text-[var(--marketing-text-subtle)]">
            <span className="text-[var(--marketing-text)]">@zaddyfunds_</span>
            {" "}· Artist Manager
          </p>
        </div>

        <div className="mt-20 grid divide-y divide-[color:var(--marketing-border)] border-y border-[color:var(--marketing-border)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {supportingQuotes.map((item) => (
            <figure
              key={item.quote}
              className="flex flex-col justify-between py-10 lg:px-10 lg:py-14"
            >
              <blockquote>
                <p className="text-balance text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
                  &ldquo;{item.quote}&rdquo;
                </p>
              </blockquote>
              <figcaption className="mt-8 font-mono text-[0.74rem] tracking-[0.18em] text-[var(--marketing-text-subtle)]">
                <span className="text-[var(--marketing-text)]">{item.name}</span>
                {" "}· {item.role}
              </figcaption>
            </figure>
          ))}
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}

export function FinalCTASection() {
  return (
    <ScrollReveal>
      <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
        <div className="text-center">
          <h2 className={centeredHeadlineClass}>
            Releases shouldn&apos;t be hard to run.
          </h2>

          <div className="relative z-[60] mt-10 flex flex-col items-center gap-3">
            <Link href={APP_AUTH_URL} className={solidButtonClassName}>
              Start free for 28 days
            </Link>
            <p className="font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
              NO CARD REQUIRED
            </p>
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
