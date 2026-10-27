'use client';

import { create } from 'zustand';

import type { CreatedPlan, PlanBudget, PlanReleaseType, ReadyItem } from '@/lib/release-planning';

/**
 * The planner intake's launcher, plus the two answers a build can leave
 * behind for the workspace to act on.
 *
 * The intake can be opened from four places that live in different ownership
 * islands: the workspace empty-state card, a note, an UrgAns chip on the
 * assistant page, and the same chip inside the dock. Drilling a callback down
 * to all of them would touch a file per entry point, so the modal is mounted
 * once in AppShell and opened through this store instead.
 *
 * SINCE 2026-09-15 THE INTAKE BUILDS THE PLAN. There is no draft to review:
 * finishing the questions creates the activities, and the modal has closed
 * and navigated by the time its request resolves (it takes up to about half
 * a minute on the model). So the outcome cannot live in the modal's own state
 * — it lands here, and WorkspaceView, which is where the manager is by then,
 * subscribes: `lastBuilt` for a plan that landed (refresh the activities, say
 * so, offer the press kit and the tour), `buildError` for a build UrgAns
 * refused because it could not read the typed notes (the card offers to try
 * again, and the answers are still in sessionStorage).
 */

/** 'onboarding' (2026-10-11): the first plan, opened straight after signup. */
/** 'ideas' (2026-10-26): Draft with AI on a rollout's Ideas card; the notes ride in as extraNotes. */
/** 'record' (2026-10-27): Plan the rollout on a record in the making. */
export type PlannerIntakeSource = 'empty_state' | 'note' | 'chip' | 'onboarding' | 'ideas' | 'record';

export type PlannerIntakePrefill = {
  releaseType?: PlanReleaseType;
  /** YYYY-MM-DD, already resolved by the caller. A usable future date skips the date question. */
  releaseDate?: string;
  /**
   * The artist the caller vouches for: the scoped rollout's own artist, or the
   * one onboarding just asked for. Present means the artist question is
   * skipped (lib/planner-intake-steps.ts). Leave it out when the caller does
   * not actually know whose rollout this is.
   */
  artistName?: string;
  /**
   * "What's already done?", when the caller already asked it (onboarding,
   * 2026-10-11). Present and non-empty means the planner skips the question
   * and uses this as the answer.
   */
  readyToday?: ReadyItem[];
  budget?: PlanBudget;
  /** Free text for the last question. A note's body arrives here. */
  extraNotes?: string;
  /**
   * Where the music is, when the caller knows (a record, 2026-10-27: every
   * song done is finished, else still making it). Present means planner v2
   * skips "Where's the music right now?".
   */
  musicStage?: 'making' | 'finished';
  /** "EP · 4 songs · 2 credits", shown on the first question. */
  fromRecord?: string;
};

export type PlannerIntakePayload = {
  source: PlannerIntakeSource;
  /** The release to plan. Absent means the intake creates one on completion. */
  releaseId?: string;
  /** A note to link to the release the intake creates. */
  noteId?: string;
  prefill?: PlannerIntakePrefill;
  /**
   * The rollout was made a moment ago only so the planner had something to
   * plan (picking Single, EP or Album). Closing the planner before it finishes
   * then asks the server to discard it, which it does only while the rollout
   * is still untouched (lib/release-draft-discard.ts). Without this, every
   * abandoned try left an empty "Untitled rollout" in the catalogue.
   */
  discardIfAbandoned?: boolean;
  /**
   * The title the rollout was created with, when the create step named it
   * (v1.91.3). Sent with the discard so a shell that was only named, and
   * nothing else, is still discarded; a rename after creation keeps it.
   */
  createdTitle?: string | null;
};

/**
 * A Solo team's release.draft_plan run refused with `reason: 'plan_required'`
 * — the entitlement gate's own answer, verbatim (see UrgansLockedSheet).
 *
 * Lives here rather than as local state in the modal for the same reason the
 * build outcomes do: the modal has already closed and navigated away by the
 * time its background request can resolve, so there is nowhere local left to
 * hold the answer. One shared field means one UrgansLockedSheet mount (in
 * WorkspaceView) serves it.
 */
export type PlannerLockedRefusal = {
  releaseId: string;
  message: string;
  actionType: string;
};

/** A plan that landed. Held until WorkspaceView has acted on it, then cleared. */
export type PlannerBuiltPlan = {
  releaseId: string;
  plan: CreatedPlan;
};

/**
 * A build that was refused with nothing created — today only
 * `tailoring_unavailable`, the model failing while the manager had typed
 * notes it must not ignore. Cleared when the intake is opened again for that
 * release, which is the only way out the card offers.
 */
export type PlannerBuildError = {
  releaseId: string;
  message: string;
};

type PlannerStore = {
  intake: PlannerIntakePayload | null;
  /**
   * Releases with a build in flight. The intake closes the moment it fires
   * the request rather than sitting on a spinner, so the empty-state card
   * needs to know a plan is coming before its activities exist.
   */
  generatingReleaseIds: string[];
  lockedRefusal: PlannerLockedRefusal | null;
  lastBuilt: PlannerBuiltPlan | null;
  buildError: PlannerBuildError | null;
  openIntake: (payload: PlannerIntakePayload) => void;
  closeIntake: () => void;
  setGenerating: (releaseId: string, generating: boolean) => void;
  isGenerating: (releaseId: string) => boolean;
  setLockedRefusal: (refusal: PlannerLockedRefusal | null) => void;
  markBuilt: (releaseId: string, plan: CreatedPlan) => void;
  clearBuilt: () => void;
  /** Null clears. */
  setBuildError: (error: PlannerBuildError | null) => void;
};

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  intake: null,
  generatingReleaseIds: [],
  lockedRefusal: null,
  lastBuilt: null,
  buildError: null,

  openIntake: (payload) =>
    set((current) => ({
      intake: payload,
      // Reopening the questions for a release IS the retry, so the failed
      // state stops being true the moment they are open again.
      buildError:
        current.buildError && payload.releaseId === current.buildError.releaseId
          ? null
          : current.buildError,
    })),
  closeIntake: () => set({ intake: null }),

  setGenerating: (releaseId, generating) =>
    set((current) => {
      const without = current.generatingReleaseIds.filter((id) => id !== releaseId);
      return { generatingReleaseIds: generating ? [...without, releaseId] : without };
    }),

  isGenerating: (releaseId) => get().generatingReleaseIds.includes(releaseId),

  setLockedRefusal: (refusal) => set({ lockedRefusal: refusal }),

  markBuilt: (releaseId, plan) => set({ lastBuilt: { releaseId, plan }, buildError: null }),
  clearBuilt: () => set({ lastBuilt: null }),
  setBuildError: (error) => set({ buildError: error }),
}));
