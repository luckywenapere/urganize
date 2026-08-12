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

type PlannerStore = {
  intake: PlannerIntakePayload | null;
  /**
   * Releases with a generation call in flight. The intake navigates to the
   * review scene the moment it fires the request rather than sitting on a
   * spinner, so the scene needs to know a draft is coming before one exists.
   */
  generatingReleaseIds: string[];
  openIntake: (payload: PlannerIntakePayload) => void;
  closeIntake: () => void;
  setGenerating: (releaseId: string, generating: boolean) => void;
  isGenerating: (releaseId: string) => boolean;
};

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  intake: null,
  generatingReleaseIds: [],

  openIntake: (payload) => set({ intake: payload }),
  closeIntake: () => set({ intake: null }),

  setGenerating: (releaseId, generating) =>
    set((current) => {
      const without = current.generatingReleaseIds.filter((id) => id !== releaseId);
      return { generatingReleaseIds: generating ? [...without, releaseId] : without };
    }),

  isGenerating: (releaseId) => get().generatingReleaseIds.includes(releaseId),
}));
