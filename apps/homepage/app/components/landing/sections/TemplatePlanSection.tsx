import { ThemedProductShot } from "../ThemedProductShot";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass, mutedLeadClass } from "./shared";

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
            Every release starts with a plan. Yours has 64 activities.
          </h2>

          <p className={`mx-auto mt-8 max-w-[40rem] ${mutedLeadClass}`}>
            Create a release and Urganize lays out the whole 11-week rollout.
            Real managers wrote it. Your team owns every activity, and you can
            change anything.
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
          + 56 MORE, CREATED THE MOMENT YOU START A RELEASE
        </p>

        {/* Real screenshot of a release built from the template above (light
            and dark retaken together 2026-08-01, same release and scroll
            position in both). It sits under the 64-activity headline, so the
            capture must show a template-built release: 1 of 64 with a due
            date on every row, never a blank one. Retake BOTH themes if the
            UI changes meaningfully. */}
        <div className="mx-auto mt-14 max-w-[58rem] overflow-hidden rounded-xl border border-[color:var(--marketing-border)]">
          <ThemedProductShot
            light="/images/product/workspace-tasks.png"
            dark="/images/product/workspace-tasks-dark.png"
            alt="A release open in Urganize: the progress bar at 1 of 64, the upcoming activities listed with a due date on every row, and the UrgAns assistant docked alongside them."
            width={1920}
            height={970}
            sizes="(min-width: 1024px) 928px, 100vw"
          />
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
