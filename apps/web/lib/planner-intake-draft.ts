// Mid-intake answers, held in sessionStorage so stepping back and forward, or
// an accidental refresh on a phone, does not throw away seven answers. Modeled
// on lib/onboarding-draft.ts, which solves the same problem for signup.
//
// Deliberately NOT the database: until the manager finishes, these answers are
// worth nothing server-side. The draft table's job starts at generation, which
// is also when this record is cleared.

import {
  BUDGET_OPTIONS,
  GOAL_OPTIONS,
  MAX_ARTIST_NAME_LENGTH,
  MAX_EXTRA_NOTES_LENGTH,
  MAX_GOAL_TEXT_LENGTH,
  READY_TODAY_OPTIONS,
  RELEASE_TYPE_OPTIONS,
  isPlanScope,
  type PlanBudget,
  type PlanGoal,
  type PlanReleaseType,
  type PlanScope,
  type ReadyItem,
} from './release-planning';

export interface PlannerIntakeDraft {
  releaseType: PlanReleaseType | null;
  artistName: string;
  releaseDate: string;
  /** True when the date came from the planner's suggestion rather than typing. */
  dateSuggested: boolean;
  readyToday: ReadyItem[];
  goal: PlanGoal | null;
  goalText: string;
  budget: PlanBudget | null;
  /** Q7 chips — the kinds of work to leave out entirely. See PLAN_SCOPES. */
  exclusions: PlanScope[];
  extraNotes: string;
  /** The release these answers belong to, so one release's answers cannot
   * resurface while planning a different one. */
  releaseId: string;
}

export const EMPTY_PLANNER_INTAKE_DRAFT: PlannerIntakeDraft = {
  releaseType: null,
  artistName: '',
  releaseDate: '',
  dateSuggested: false,
  readyToday: [],
  goal: null,
  goalText: '',
  budget: null,
  exclusions: [],
  extraNotes: '',
  releaseId: '',
};

const STORAGE_KEY = 'urganize.planner.intake';

const RELEASE_TYPES = RELEASE_TYPE_OPTIONS.map((o) => o.value);
const READY_ITEMS = READY_TODAY_OPTIONS.map((o) => o.value);
const GOALS = GOAL_OPTIONS.map((o) => o.value);
const BUDGETS = BUDGET_OPTIONS.map((o) => o.value);

const asString = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

export function loadPlannerIntakeDraft(): PlannerIntakeDraft {
  if (typeof window === 'undefined') return EMPTY_PLANNER_INTAKE_DRAFT;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PLANNER_INTAKE_DRAFT;
    const parsed = JSON.parse(raw) as Partial<PlannerIntakeDraft> | null;
    if (!parsed || typeof parsed !== 'object') return EMPTY_PLANNER_INTAKE_DRAFT;

    return {
      releaseType: RELEASE_TYPES.includes(parsed.releaseType as PlanReleaseType)
        ? (parsed.releaseType as PlanReleaseType)
        : null,
      artistName: asString(parsed.artistName, MAX_ARTIST_NAME_LENGTH),
      releaseDate: asString(parsed.releaseDate, 10),
      dateSuggested: parsed.dateSuggested === true,
      readyToday: Array.isArray(parsed.readyToday)
        ? parsed.readyToday.filter((item): item is ReadyItem =>
            READY_ITEMS.includes(item as ReadyItem)
          )
        : [],
      goal: GOALS.includes(parsed.goal as PlanGoal) ? (parsed.goal as PlanGoal) : null,
      goalText: asString(parsed.goalText, MAX_GOAL_TEXT_LENGTH),
      budget: BUDGETS.includes(parsed.budget as PlanBudget)
        ? (parsed.budget as PlanBudget)
        : null,
      exclusions: Array.isArray(parsed.exclusions)
        ? parsed.exclusions.filter((item): item is PlanScope => isPlanScope(item))
        : [],
      extraNotes: asString(parsed.extraNotes, MAX_EXTRA_NOTES_LENGTH),
      releaseId: asString(parsed.releaseId, 64),
    };
  } catch {
    return EMPTY_PLANNER_INTAKE_DRAFT;
  }
}

export function savePlannerIntakeDraft(draft: PlannerIntakeDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Private mode or a full quota. The answers just will not survive a
    // refresh; the manager can still finish the intake.
  }
}

export function clearPlannerIntakeDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best effort.
  }
}
