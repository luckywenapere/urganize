'use client';

import { create } from 'zustand';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';

// Shell-wide state (design overhaul, 2026-10-04): which artist the manager is
// looking at, and whether the command bar is open.
//
// The selected artist is the top bar's switcher, like Deel's group switcher.
// "All artists" is null. It lives here, not in each page, because a manager
// thinks artist first (founder call), so choosing Dorian on Home should still
// mean Dorian on Catalogue. It is a VIEW filter only: nothing is written to the
// server and no access rule reads it.
//
// Persisted per browser, hydrated in a mount effect by the switcher (a storage
// read during render is the hydration mismatch this repo has had to fix before).

export const SHELL_ARTIST_KEY = 'urganize.shell.artist';
export const SHELL_ARTIST_VERSION = 1;

type ShellStore = {
  selectedArtistId: string | null;
  commandOpen: boolean;
  /** The create-rollout modal, mounted once by AppShell. Any page's primary
   *  button opens it through here, so no page owns a second copy. */
  createOpen: boolean;
  /** How the create modal should start: 'template' (UrgAns plans it) or
   *  'blank' (the manager plans it). null = the modal's own default. Set by
   *  the plan choice (components/releases/PlanChoiceDialog.tsx). */
  createPlan: 'template' | 'blank' | null;
  /** Why the rollout is being made (lib/rollout-origin.ts): 'hint' when a
   *  rollout offer opened it, 'choice' otherwise. Sent with the create. */
  createOrigin: 'choice' | 'hint';
  /** The plan choice (UrgAns plans it, or plan it myself), opened by a
   *  rollout offer: Home's "Got a release coming?" card and the empty states
   *  of pages that need a rollout. Mounted once by AppShell. */
  planChoiceOpen: boolean;
  /** The artist the offer was for, carried into the create modal. */
  planChoiceArtistId: string | null;
  openPlanChoice: (options?: { artistId?: string | null }) => void;
  closePlanChoice: () => void;
  /** The artist the create modal starts on, when opened from an artist's page.
   *  null = the modal's own default. */
  createArtistId: string | null;
  /** A page that mounts its own create modal (WorkspaceView on Rollouts,
   *  which lands you in the new rollout) registers its opener here, so the
   *  phone tab row's New rollout opens that one modal and not a second copy.
   *  null = the shell's modal (openCreate). */
  createHandler: (() => void) | null;
  setCreateHandler: (handler: (() => void) | null) => void;
  setSelectedArtistId: (id: string | null) => void;
  hydrateSelectedArtistId: (id: string | null) => void;
  openCommand: () => void;
  closeCommand: () => void;
  openCreate: (plan?: 'template' | 'blank', options?: { origin?: 'choice' | 'hint'; artistId?: string | null }) => void;
  openCreateForArtist: (artistId: string) => void;
  closeCreate: () => void;
};

export const useShellStore = create<ShellStore>((set) => ({
  selectedArtistId: null,
  commandOpen: false,
  createOpen: false,
  createPlan: null,
  createOrigin: 'choice',
  createArtistId: null,
  planChoiceOpen: false,
  planChoiceArtistId: null,
  createHandler: null,
  setCreateHandler: (handler) => set({ createHandler: handler }),
  setSelectedArtistId: (id) => {
    set({ selectedArtistId: id });
    try {
      writePersistedState(SHELL_ARTIST_KEY, SHELL_ARTIST_VERSION, { artistId: id });
    } catch {
      // A selection that cannot be saved still applies for this session.
    }
  },
  hydrateSelectedArtistId: (id) => set({ selectedArtistId: id }),
  openCommand: () => set({ commandOpen: true }),
  closeCommand: () => set({ commandOpen: false }),
  openCreate: (plan, options) =>
    set({
      createOpen: true,
      createPlan: plan ?? null,
      createOrigin: options?.origin ?? 'choice',
      createArtistId: options?.artistId ?? null,
    }),
  openCreateForArtist: (artistId) =>
    set({ createOpen: true, createPlan: null, createOrigin: 'choice', createArtistId: artistId }),
  closeCreate: () => set({ createOpen: false, createPlan: null, createOrigin: 'choice', createArtistId: null }),
  openPlanChoice: (options) => set({ planChoiceOpen: true, planChoiceArtistId: options?.artistId ?? null }),
  closePlanChoice: () => set({ planChoiceOpen: false, planChoiceArtistId: null }),
}));

/** Reads the saved choice. Returns undefined when there is none, so a stored
 *  "All artists" (null) is told apart from "never chose". Stored inside an
 *  object because the persisted-state reader answers null for "nothing saved". */
export function readSavedArtistId(): string | null | undefined {
  const saved = readPersistedState(
    SHELL_ARTIST_KEY,
    SHELL_ARTIST_VERSION,
    (value): value is { artistId: string | null } =>
      typeof value === 'object' &&
      value !== null &&
      'artistId' in value &&
      (typeof (value as { artistId: unknown }).artistId === 'string' ||
        (value as { artistId: unknown }).artistId === null)
  );
  return saved === null ? undefined : saved.artistId;
}
