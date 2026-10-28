/**
 * Work the plan has two views, List and Timeline, behind one small toggle
 * (founder approved mock, Oct 28, 2026). They are still the `activities` and
 * `timeline` scenes in the URL; this file holds the rules around choosing one.
 */
export type PlanView = 'activities' | 'timeline';

export const PLAN_VIEWS: readonly PlanView[] = ['activities', 'timeline'];

/** True for the two scene names that are views of the plan. */
export function isPlanView(value: string | null | undefined): value is PlanView {
  return value === 'activities' || value === 'timeline';
}

/**
 * A phone held upright. The timeline needs about 34rem of width for its week
 * columns, so below sm in portrait it asks the person to turn the phone. A
 * tablet upright, or any phone on its side, is wide enough and just opens it.
 */
export const NARROW_PORTRAIT_QUERY = '(max-width: 639px) and (orientation: portrait)';

const remembered = new Map<string, PlanView>();

/** The view a rollout was last showing this visit (not stored across visits). */
export function rememberPlanView(releaseId: string, view: PlanView): void {
  remembered.set(releaseId, view);
}

export function recallPlanView(releaseId: string): PlanView | null {
  return remembered.get(releaseId) ?? null;
}

/**
 * Which view to open when the person has not picked one. Their last pick wins
 * over the default; an upright phone never opens the timeline on its own, so a
 * fresh rollout there lands on the list rather than a "turn your phone" screen.
 */
export function pickPlanView({
  last,
  fallback,
  narrowPortrait,
}: {
  last: PlanView | null;
  fallback: PlanView;
  narrowPortrait: boolean;
}): PlanView {
  const choice = last ?? fallback;
  return narrowPortrait && choice === 'timeline' ? 'activities' : choice;
}
