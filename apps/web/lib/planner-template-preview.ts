/**
 * The free look at a plan BEFORE any UrgAns credits are spent (2026-10-09).
 *
 * The planner asks its questions and only then builds the plan, which costs
 * about 12 credits. Until v1.91.4 a new person was told that cost at the first
 * question with nothing to show for it. This module answers "what would I get?"
 * from the hand-written playbook the planner starts from: how many activities,
 * how they split across the four phases, and a few real activity names.
 *
 * Pure and client-safe on purpose. It reads the static templates and nothing
 * else: no model call, no credits, no network, no database. That is the whole
 * promise of the preview, and lib/planner-template-preview.test.ts holds it.
 *
 * It picks the playbook with the SAME rule the plan route uses
 * (`getPlannerTemplate` in lib/release-planning-actions-server.ts): EP and
 * album use their own playbook when NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES is
 * on and the single playbook otherwise. That module is server-only, so the
 * rule is repeated here and a test pins the two to the same template id.
 */

import { getTemplate, getTemplateLeadTimeDays, getTemplateSpanDays } from './release-templates/loader';
import type { Template } from './release-templates/types';
import {
  PLAN_PHASE_LABELS,
  PLAN_PHASE_ORDER,
  derivePlanPhase,
  type PlanPhase,
  type PlanReleaseType,
} from './release-planning';

/** How many example activity names the preview shows, at most one per phase. */
export const PREVIEW_EXAMPLE_LIMIT = 4;

export type PlannerPreviewPhase = {
  phase: PlanPhase;
  label: string;
  /** Activities in the playbook that start in this phase. */
  count: number;
};

export type PlannerTemplatePreview = {
  /** The type the person chose. */
  releaseType: PlanReleaseType;
  /** The playbook the plan will actually start from (its stable id). */
  templateId: string;
  /** True when an EP or album starts from the single playbook (flag off). */
  usesSinglePlaybook: boolean;
  activityCount: number;
  /** Weeks before release day the playbook starts. */
  leadWeeks: number;
  /** Weeks from the first activity to the last. */
  spanWeeks: number;
  /** Only phases that hold at least one activity, in plan order. */
  phases: PlannerPreviewPhase[];
  /** Real activity titles from the playbook, at most one per phase. */
  examples: string[];
};

/** The playbook a plan for this type starts from. Mirrors getPlannerTemplate. */
export function previewTemplateFor(releaseType: PlanReleaseType): {
  template: Template;
  usesSinglePlaybook: boolean;
} {
  if (releaseType === 'ep' || releaseType === 'album') {
    try {
      return { template: getTemplate(releaseType), usesSinglePlaybook: false };
    } catch {
      // Behind NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES: the plan uses the single
      // playbook, so the preview has to show that one too.
    }
    return { template: getTemplate('single'), usesSinglePlaybook: true };
  }
  return { template: getTemplate('single'), usesSinglePlaybook: false };
}

/**
 * Everything the preview card shows, built from the playbook alone.
 *
 * Examples are the first required activity of each phase in playbook order
 * (an optional one only when a phase has nothing required), so they are the
 * things every plan of this type keeps. Phases are the same boundaries the
 * plan and the timeline use (`derivePlanPhase`).
 */
export function buildPlannerTemplatePreview(releaseType: PlanReleaseType): PlannerTemplatePreview {
  const { template, usesSinglePlaybook } = previewTemplateFor(releaseType);

  const counts = new Map<PlanPhase, number>();
  const firstRequired = new Map<PlanPhase, string>();
  const firstAny = new Map<PlanPhase, string>();

  for (const task of template.tasks) {
    const phase = derivePlanPhase(task.offset_days);
    counts.set(phase, (counts.get(phase) ?? 0) + 1);
    if (!firstAny.has(phase)) firstAny.set(phase, task.title);
    if (!task.optional && !firstRequired.has(phase)) firstRequired.set(phase, task.title);
  }

  const phases: PlannerPreviewPhase[] = PLAN_PHASE_ORDER.filter((phase) => (counts.get(phase) ?? 0) > 0).map(
    (phase) => ({ phase, label: PLAN_PHASE_LABELS[phase], count: counts.get(phase) ?? 0 })
  );

  const examples = phases
    .map(({ phase }) => firstRequired.get(phase) ?? firstAny.get(phase))
    .filter((title): title is string => Boolean(title))
    .slice(0, PREVIEW_EXAMPLE_LIMIT);

  return {
    releaseType,
    templateId: template.id,
    usesSinglePlaybook,
    activityCount: template.tasks.length,
    leadWeeks: Math.round(getTemplateLeadTimeDays(template) / 7),
    spanWeeks: Math.round(getTemplateSpanDays(template) / 7),
    phases,
    examples,
  };
}

const TYPE_WORD: Record<PlanReleaseType, string> = { single: 'single', ep: 'EP', album: 'album' };

/** What the card says. Kept here so the test can read it without rendering. */
export const PLANNER_PREVIEW_COPY = {
  kicker: 'Free preview',
  heading: 'Your starting plan',
  examplesLabel: 'For example',
  noCharge: 'Looking is free. Nothing is charged until you press Build my plan.',
} as const;

/** "64 activities over 11 weeks", the card's headline number. */
export function previewSummaryLine(preview: PlannerTemplatePreview): string {
  const activities = `${preview.activityCount} ${preview.activityCount === 1 ? 'activity' : 'activities'}`;
  return `${activities} over ${preview.spanWeeks} ${preview.spanWeeks === 1 ? 'week' : 'weeks'}`;
}

/** Says where the plan comes from and that UrgAns changes it. */
export function previewSourceLine(preview: PlannerTemplatePreview): string {
  if (preview.usesSinglePlaybook) {
    return `Your ${TYPE_WORD[preview.releaseType]} starts from our single playbook for now. UrgAns tailors it to your answers.`;
  }
  return `This is our ${TYPE_WORD[preview.releaseType]} playbook. UrgAns tailors it to your answers.`;
}
