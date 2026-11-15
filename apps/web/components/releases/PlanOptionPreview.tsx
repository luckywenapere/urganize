/**
 * The small previews on the plan choice (#970, mock approved Nov 1, 2026):
 * each option shows what it gives you before you pick. UrgAns's option shows a
 * few steps of a draft plan; plan it myself shows an empty rollout.
 *
 * Fixed example content, drawn in the app's own tokens so it follows the
 * theme. The "when" chips come from the planner's own labels
 * (lib/planner-v2/when.ts), so the preview reads the same with no release
 * date. Decorative: the option button's title and line are its name, so the
 * preview is hidden from screen readers.
 */

import { Check, Plus } from '@/components/icons';

import { isPlannerV2Enabled } from '@/lib/planner-v2/answers';
import { relativeWhenLabel } from '@/lib/planner-v2/when';

/** One option card. At sm it is a 3-row subgrid (preview, title, line) of the
 *  chooser's two-column grid, so both cards' previews and titles line up. */
export const PLAN_OPTION_CARD =
  'motion-focus motion-press flex flex-col items-start gap-3 rounded-xl border border-stroke-default bg-bg-elevated p-4 min-w-0 text-left transition-colors hover:bg-bg-hover sm:row-span-3 sm:grid sm:grid-cols-[minmax(0,1fr)] sm:grid-rows-subgrid sm:items-stretch sm:p-5';

const PANEL =
  'flex h-full w-full flex-col rounded-xl border border-stroke-default bg-[rgb(var(--color-stroke)/0.045)] px-3.5 pb-3 pt-3';

const LABEL = 'text-[10.5px] font-semibold uppercase tracking-[0.1em] text-content-tertiary';

const STEPS = [
  { title: 'Lock the master', when: relativeWhenLabel(0, true) },
  { title: 'Upload to your distributor', when: relativeWhenLabel(0, true) },
  { title: 'Pitch to curators', when: relativeWhenLabel(-28, false) },
];

function StepCircle() {
  return <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-content-tertiary/70" />;
}

/** A few steps of the draft plan UrgAns writes. `planner` false: the proven
 *  rollout plan instead, so the foot does not promise questions. The step
 *  count is planner v2's (10 to 18); the v1 intake tailors the playbook, so it
 *  promises no number. */
export function UrgansPlanPreview({ planner }: { planner: boolean }) {
  return (
    <span aria-hidden="true" className={PANEL}>
      <span className={LABEL}>{planner ? 'Draft plan' : 'Proven plan'}</span>
      <span className="mt-2 flex flex-col gap-1.5">
        {STEPS.map((step) => (
          <span key={step.title} className="flex min-h-[26px] items-center gap-2.5">
            <StepCircle />
            <span className="min-w-0 flex-1 truncate text-[13px] text-content-primary">{step.title}</span>
            <span className="shrink-0 rounded-full bg-bg-hover px-2 py-0.5 text-[11.5px] text-content-secondary">
              {step.when}
            </span>
          </span>
        ))}
        <span className="flex min-h-[26px] items-center gap-2.5">
          <StepCircle />
          <span className="h-[7px] w-[45%] rounded-full bg-content-tertiary/20" />
          <span className="ml-auto h-[7px] w-[20%] rounded-full bg-content-tertiary/20" />
        </span>
      </span>
      <span className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand">
        <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
        {planner
          ? isPlannerV2Enabled()
            ? 'About 14 steps, from your answers'
            : 'Shaped to your answers'
          : 'Every step, ready to edit'}
      </span>
    </span>
  );
}

/** The rollout you start with when you plan it yourself: nothing in it yet. */
export function EmptyRolloutPreview() {
  return (
    <span aria-hidden="true" className={PANEL}>
      <span className={LABEL}>Empty rollout</span>
      <span className="mt-2 flex flex-col gap-2">
        <span className="flex h-[34px] items-center gap-2 rounded-lg border border-dashed border-content-tertiary/45 px-3 text-[13px] text-content-secondary">
          <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          New activity
        </span>
        <span className="h-[30px] rounded-lg border border-dashed border-content-tertiary/25" />
        <span className="hidden h-[30px] rounded-lg border border-dashed border-content-tertiary/25 opacity-60 sm:block" />
      </span>
    </span>
  );
}
