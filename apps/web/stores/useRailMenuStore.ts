'use client';

import { create } from 'zustand';

/**
 * How a rollout menu rendered by WorkspaceView gets into the right-hand column
 * that AppShell owns.
 *
 * TWO FACTS, AND NOTHING ELSE. Where the menu goes (`slot`, an element inside
 * the column, handed over by the column itself) and who wants to be there
 * (`owners`). Whether there is a menu is DERIVED from both by `selectMenuPresent`
 * and never stored, so the column, the side menu and the workspace read one
 * answer instead of three copies that could disagree.
 *
 * WHY A PORTAL AND NOT A STORE-FED MENU. Share, Change artist and Archive depend
 * on state that lives in WorkspaceView (who owns the rollout, how many artists
 * the team has, whether the rollout is finished, whether each dialog is open,
 * `setToast`). A copy of the menu hosted by the column would have to be handed
 * all of that through a store, would lag the URL by a frame, and could offer
 * Archive for the wrong rollout. Rendering the menu where that state already
 * lives and portalling only its DOM into the column keeps one owner for it.
 *
 * WHY THE OWNERS ARE A LIST. The loading skeleton and the real menu are both
 * owners for a moment while one hands over to the other. If the skeleton's
 * release emptied a single flag the column would collapse and reopen at the
 * exact instant the page finishes loading.
 *
 * Pure UI state: never persisted, and nothing in here survives a reload.
 */

type RailMenuStore = {
  /** The element inside the right-hand column that the menu renders into, or
   *  null while the column is not mounted (any route without app chrome, and the
   *  assistant page, where the rail renders nowhere). */
  slot: HTMLElement | null;
  /** Ids of the mounted things that want the slot. Ids come from `useId`. */
  owners: readonly string[];
  /** A stable function for the life of the app, which is what makes it safe to
   *  hand to React as a `ref`. An inline ref callback is a new function every
   *  render, so React would call the old one with null and the new one with the
   *  element, unmounting and remounting the portalled menu on every render of
   *  the column and dropping focus each time. */
  setSlot: (slot: HTMLElement | null) => void;
  claim: (id: string) => void;
  release: (id: string) => void;
};

export const useRailMenuStore = create<RailMenuStore>((set) => ({
  slot: null,
  owners: [],
  setSlot: (slot) => set({ slot }),
  // Both return the SAME state object when there is nothing to change: zustand
  // notifies on reference change, and an equal-but-new array would re-render
  // every subscriber for no reason.
  claim: (id) =>
    set((state) => (state.owners.includes(id) ? state : { owners: [...state.owners, id] })),
  release: (id) =>
    set((state) =>
      state.owners.includes(id)
        ? { owners: state.owners.filter((owner) => owner !== id) }
        : state
    ),
}));

/** Is there a menu to show: somewhere to put it AND somebody who wants it. */
export const selectMenuPresent = (state: Pick<RailMenuStore, 'slot' | 'owners'>): boolean =>
  state.slot !== null && state.owners.length > 0;
