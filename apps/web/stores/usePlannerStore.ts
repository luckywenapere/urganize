'use client';

import { create } from 'zustand';

import type { PlanBudget, PlanReleaseType } from '@/lib/release-planning';

/**
 * The planner intake's launcher, and nothing else.
 *
 * The intake can be opened from four places that live in different ownership
 * islands: the workspace empty-state card, a note, an UrgAns chip on the
 * assistant page, and the same chip inside the dock. Drilling a callback down
 * to all of them would touch a file per entry point, so the modal is mounted
 * once in AppShell and opened through this store instead.
 *
 * The draft plan itself is deliberately NOT here. It lives in the review scene
 * that edits it, because that scene is its only consumer and the document is
 * under an autosave queue — a second copy in a global store is just something
 * to desync.
 */

export type PlannerIntakeSource = 'empty_state' | 'note' | 'chip';

export type PlannerIntakePrefill = {
  releaseType?: PlanReleaseType;
  /** YYYY-MM-DD, already resolved by the caller. */
  releaseDate?: string;
  budget?: PlanBudget;
  /** Free text for the last question. A note's body arrives here. */
  extraNotes?: string;
};

export type PlannerIntakePayload = {
  source: PlannerIntakeSource;
  /** The release to plan. Absent means the intake creates one on completion. */
  releaseId?: string;
  /** A note to link to the release the intake creates. */
  noteId?: string;
  prefill?: PlannerIntakePrefill;
};

/**
 * A Solo team's release.draft_plan run refused with `reason: 'plan_required'`
 * — the entitlement gate's own answer, verbatim (see UrgansLockedSheet).
 *
 * Lives here rather than as local state in whichever component fired the
 * request, for the same reason the intake itself does: the one-tap card and
 * the seven-question modal's fire-and-forget submit are two different
 * ownership islands, and the modal in particular has already closed and
 * navigated away by the time its background request can resolve — there is
 * nowhere local left to hold the answer. One shared field means one
 * UrgansLockedSheet mount (in WorkspaceView) serves both entry points.
 */
export type PlannerLockedRefusal = {
  releaseId: string;
  message: string;
  actionType: string;
};

type PlannerStore = {
  intake: PlannerIntakePayload | null;
  /**
   * Releases with a generation call in flight. The intake navigates to the
   * review scene the moment it fires the request rather than sitting on a
   * spinner, so the scene needs to know a draft is coming before one exists.
   */
  generatingReleaseIds: string[];
  lockedRefusal: PlannerLockedRefusal | null;
  openIntake: (payload: PlannerIntakePayload) => void;
  closeIntake: () => void;
  setGenerating: (releaseId: string, generating: boolean) => void;
  isGenerating: (releaseId: string) => boolean;
  setLockedRefusal: (refusal: PlannerLockedRefusal | null) => void;
};

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  intake: null,
  generatingReleaseIds: [],
  lockedRefusal: null,

  openIntake: (payload) => set({ intake: payload }),
  closeIntake: () => set({ intake: null }),

  setGenerating: (releaseId, generating) =>
    set((current) => {
      const without = current.generatingReleaseIds.filter((id) => id !== releaseId);
      return { generatingReleaseIds: generating ? [...without, releaseId] : without };
    }),

  isGenerating: (releaseId) => get().generatingReleaseIds.includes(releaseId),

  setLockedRefusal: (refusal) => set({ lockedRefusal: refusal }),
}));
