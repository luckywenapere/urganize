import type { Metadata } from "next";
import Link from "next/link";
import { ProofLine } from "../components/landing/ProofLine";
import { ResponsiveProductShot } from "../components/landing/ResponsiveProductShot";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { TrialButton } from "../components/landing/TrialButton";
import { PRIMARY_CTA } from "@/lib/app-urls";
import { WorkspaceShotSection } from "../components/landing/sections/WorkspaceShotSection";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";
import type { ProductShot } from "@/content/product-shots";

export const metadata: Metadata = buildPageMetadata({
  title: "Why Urganize over WhatsApp and Google Drive",
  description:
    "WhatsApp and Drive hold the chat. Urganize holds the plan: every task has one owner and one date, and each person gets a reminder.",
  path: "/why-urganize",
});

// Same honesty rule as /features: every Urganize claim below describes the
// product as it ships today, and every WhatsApp/Drive line describes the
// workflow managers actually run before switching. No invented numbers, no
// imaginary features, no trash-talking tools people rely on.
//
// 2026-08-05: founder reported readers stop reading at the second block
// ("Assigned, not announced."). The page had no CTA until the very bottom
// (five screens down) and repeated the same boxed them/us diff four times
// in a row — readers extract the pattern after block one and have no
// reason to keep scrolling, and no visual proof anywhere that the product
// is real. Fixed by: a CTA in the hero, a real screenshot right after the
// first (strongest) comparison, and folding the remaining three into one
// compact section in a different format. "The plan" below is the only
// full-size comparison left; keep it that way, it is the strongest claim.
const comparisons = [
  {
    kicker: "The plan",
    title: "A real plan, not a pinned message.",
    // `them` is byte-identical to transformationPairs[0].before in
    // content/testimonials.ts — that file owns the string, this page
    // mirrors it. Change both together or not at all.
    them: "Your plan is spread across a pinned chat, an old spreadsheet and your memory. Every new release starts from scratch.",
    us: "Urganize asks about your goals and lays out a plan that fits. Or make your own. Edit or delete any task.",
    // The before/after still belongs to this claim only (it shows a single's
    // 64-task plan), so it is opted in here rather than drawn for every item.
    showBeforeAfter: true,
  },
] as const;

// The before/after still under "The plan" (#961, mock approved by the founder
// 2026-11-01). A drawn picture, not a capture: left, a release spread across a
// group chat and an old spreadsheet; right, the same release as an Urganize
// timeline where the task the chat argues about has an owner and a date. Demo
// data only (Harmattan Gold by Kanmi Gold; Ada, Kemi and Tunde are made up),
// drawn in the app's light and dark tokens so it follows the theme toggle. If
// the timeline view changes, redraw both.
const beforeAfter: ProductShot = {
  light: "/images/product/why-before-after.webp",
  dark: "/images/product/why-before-after-dark.webp",
  width: 2000,
  height: 920,
};
const beforeAfterPhone: ProductShot = {
  light: "/images/product/why-before-after-phone.webp",
  dark: "/images/product/why-before-after-phone-dark.webp",
  width: 716,
  height: 1400,
};

// Folded from three full-size blocks into one compact section (see the
// note above). Each row is a single sentence per side joined by an arrow
// instead of a boxed grid, deliberately a different shape from the "The
// plan" comparison above (and originally from the homepage's
// TransformationSection too — that section was removed 2026-08-25), so a
// visitor doesn't see the same format twice.
const compactComparisons = [
  {
    kicker: "Ownership",
    them: "Work gets assigned in a chat message that gets scrolled past.",
    us: "Every task has an owner and a due date, and unlocks the moment what it's waiting on is done.",
  },
  {
    kicker: "Feedback",
    them: "Nobody asks how a task went, so the same problems come back every release.",
    us: "After every task, Urganize asks how it went.",
  },
  {
    kicker: "Press kit",
    them: "The press kit is a doc full of dead links you rebuild from scratch every time someone asks.",
    us: "Each artist gets a press kit with its own link, and it goes along with every pitch you send.",
  },
  {
    kicker: "Status",
    them: "Finding out where a release stands means scrolling weeks of chat, for every release you run.",
    us: "One list shows progress, what's overdue and what's due this week, for everything you have going.",
  },
] as const;

const headlineClass =
  "text-balance text-[2rem] leading-[1.1] text-[var(--marketing-text)] sm:text-[2.8rem]";

export default function WhyUrganizePage() {
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
              Why Urganize
            </p>
            <h1 className="mt-8 text-balance text-[2.25rem] leading-[1.06] text-[var(--marketing-text)] sm:text-[3.6rem]">
              WhatsApp got you here.{" "}
              <span className="text-[var(--marketing-accent)]">
                It won&apos;t get you further.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              A group chat is good for talking. It is bad at holding a plan,
              even for one artist. Add a second release, a show, a third artist and
              a team passing work around, and things start to drop. Urganize
              makes the plan and gives every task one owner and one date.
            </p>
            {/* CTA moved into the hero (2026-08-05): the page previously had
                no ask until the very bottom, five screens down, so anyone
                who stopped reading early never saw one. No ProofLine here
                on purpose, per the ProofLine mount table's "keep the first
                touch light" rule; tamuno stays on the final CTA below. */}
            <div className="mt-8 flex w-full flex-col items-center gap-3">
              <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
                <TrialButton location="why_urganize_hero" size="lg" className="w-full sm:w-auto" />
                {/* A second option for a visitor not ready to sign up (#1220). */}
                <Link
                  href="/pricing"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[color:var(--marketing-border-strong)] px-7 py-4 text-base font-medium tracking-[-0.02em] text-[var(--marketing-text)] transition-colors hover:bg-[var(--marketing-surface-muted)] sm:w-auto"
                >
                  See pricing
                </Link>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--marketing-text-muted)]">{PRIMARY_CTA.note}</p>
            </div>
          </PageDawn>
        </SectionShell>

        {/* COMPARISON BLOCKS */}
        {comparisons.map((item) => (
          <ScrollReveal key={item.title}>
            <SectionShell
              className="py-[60px] lg:py-[80px]"
              containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
            >
              <div className="mx-auto max-w-[64rem] border-t border-[color:var(--marketing-border)] pt-14">
                <p className="mono-label text-[var(--marketing-accent)]">
                  {item.kicker}
                </p>
                <h2 className={`mt-5 max-w-[38rem] ${headlineClass}`}>
                  {item.title}
                </h2>

                <div className="mt-10 grid grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2">
                  <div className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8">
                    <p className="mono-label text-[var(--marketing-text-subtle)]">
                      In WhatsApp + Drive
                    </p>
                    <p className="mt-4 text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
                      {item.them}
                    </p>
                  </div>
                  <div className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8">
                    <p className="mono-label text-[var(--marketing-accent)]">
                      In Urganize
                    </p>
                    <p className="mt-4 text-[0.95rem] leading-7 text-[var(--marketing-text)]">
                      {item.us}
                    </p>
                  </div>
                </div>

                {/* The same comparison as one picture. Phone still below sm,
                    the wide one from sm up (ResponsiveProductShot picks one). */}
                {item.showBeforeAfter && (
                  <div className="mx-auto mt-10 max-w-[24rem] sm:max-w-none">
                    <ResponsiveProductShot
                      desktop={beforeAfter}
                      phone={beforeAfterPhone}
                      alt="Before: a group chat asks who is sending the master to the distributor, over a spreadsheet with question marks in the Who column. With Urganize: the same release as a timeline, 40 of 64 tasks done, where Send master to distributor belongs to Ada, due Fri 13 Nov."
                      sizes="(min-width: 1104px) 1024px, calc(100vw - 64px)"
                      phoneSizes="min(24rem, calc(100vw - 48px))"
                      fetchPriority="auto"
                    />
                  </div>
                )}
              </div>
            </SectionShell>
          </ScrollReveal>
        ))}

        {/* PRODUCT PROOF — reuses the homepage's own screenshot section
            verbatim (2026-08-05) so this page shows the workspace the
            comparison above is describing, instead of asking the reader to
            take four screens of prose on faith. */}
        <WorkspaceShotSection />

        {/* THE REST OF THE COMPARISON, COMPACTED (2026-08-05) — was three
            more full-size boxed blocks (Ownership, Press kit, Status);
            folded into one section, one sentence per side, joined by an
            arrow instead of a grid. See the comparisons array comment. */}
        <ScrollReveal>
          <SectionShell
            className="py-[60px] lg:py-[80px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto max-w-[64rem] border-t border-[color:var(--marketing-border)] pt-14">
              <p className="mono-label text-[var(--marketing-accent)]">
                Everything else
              </p>
              <h2 className={`mt-5 max-w-[40rem] ${headlineClass}`}>
                Ownership, your press kit, status and feedback change too.
              </h2>

              <div className="mt-10 divide-y divide-[color:var(--marketing-border)]">
                {compactComparisons.map((item) => (
                  <div key={item.kicker} className="py-6">
                    <p className="mono-label text-[var(--marketing-text-subtle)]">
                      {item.kicker}
                    </p>
                    <p className="mt-3 max-w-[52rem] text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
                      {item.them}{" "}
                      <span className="text-[var(--marketing-text)]">
                        → {item.us}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* HONESTY BLOCK */}
        <ScrollReveal>
          <SectionShell
            className="py-[80px] lg:py-[100px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto max-w-[52rem] text-center">
              <p className="mono-label text-[var(--marketing-text-subtle)]">
                To be clear
              </p>
              <h2 className={`mt-6 ${headlineClass}`}>
                Keep WhatsApp. Keep Drive.
              </h2>
              {/* Describing WHATSAPP and DRIVE as places is the point of
                  this beat. Under the 2026-09-09 positioning Urganize may be
                  a place too ("from one place" is the promise), and the word
                  it may never be called is "workspace". */}
              <p className="mx-auto mt-6 max-w-[38rem] text-balance text-base leading-8 text-[var(--marketing-text-muted)]">
                This isn&apos;t about deleting apps. WhatsApp is still where
                you talk, and Drive is still where your raw files live.
                Urganize doesn&apos;t replace either one. It&apos;s where the
                plan, the work and the status come together. The plan never has
                to sit in a chat thread again.
              </p>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* FINAL CTA */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={headlineClass}>Keep the chat for talking. Put the work on a plan.</h2>
              <div className="mt-10 flex w-full flex-col items-center gap-3">
                <TrialButton location="why_urganize_cta" size="lg" className="w-full sm:w-auto" />
                <p className="mt-4 text-sm leading-6 text-[var(--marketing-text-muted)]">{PRIMARY_CTA.note}</p>
                <ProofLine id="tamuno" className="mt-2" />
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>
      </main>

      <MarketingFooter />
    </div>
  );
}
