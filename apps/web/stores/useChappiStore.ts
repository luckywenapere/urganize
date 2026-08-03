'use client';

import { create } from 'zustand';
import type { ChappiMessage, ChappiReply } from '@/lib/chappi/types';
import { writePersistedState } from '@/lib/persisted-state';

// CONVERSATION state is transient, NOT persisted — no DB table, no
// localStorage — so a reload starts the assistant fresh. `messages` is
// reserved for the Phase 2 agentic loop; Phase 1 only uses `input` + `reply`.
// The one exception is `railOpen` below: pure UI-chrome state (is the side
// rail showing), persisted like the dock's open state so a reload doesn't
// snap the layout.

// Side-rail open state — same lib/persisted-state pattern as ChappiDock's
// DOCK_OPEN_KEY. Written by setRailOpen; hydrated once by AppShell in a
// mount effect (SSR-safe: first paint always renders closed).
export const RAIL_OPEN_KEY = 'urganize.chappi.rail-open';
export const RAIL_OPEN_VERSION = 1;

type ChappiStore = {
  /** Current prompt-bar text. */
  input: string;
  /** The last assistant response rendered under the prompt (deterministic
   * Phase 1; replaced by streamed output in Phase 2). */
  reply: ChappiReply | null;
  /** Ephemeral conversation turns (Phase 2+). */
  messages: ChappiMessage[];
  /** Release the conversation is pinned to via the scope picker under the
   * prompt box; null = all releases. Survives `reset` deliberately — picking
   * a release is a working-context choice, not part of one conversation. */
  scopedReleaseId: string | null;
  /** Whether the UrgAns side rail (the layout-flow right column mounted by
   * AppShell on every chrome page at lg+) is open. Survives navigation by
   * living here and reloads via localStorage; deliberately NOT part of
   * `reset` — closing a conversation shouldn't collapse the layout. */
  railOpen: boolean;
  setInput: (value: string) => void;
  setReply: (reply: ChappiReply | null) => void;
  appendMessage: (message: ChappiMessage) => void;
  setScopedReleaseId: (releaseId: string | null) => void;
  /** Opens/closes the side rail AND persists the choice — a user close
   * stays closed across pages and reloads until they reopen it (or a new
   * session lands on the assistant page again; see AppShell's arming
   * effect). */
  setRailOpen: (open: boolean) => void;
  reset: () => void;
};

export const useChappiStore = create<ChappiStore>((set) => ({
  input: '',
  reply: null,
  messages: [],
  scopedReleaseId: null,
  railOpen: false,
  setInput: (value) => set({ input: value }),
  setReply: (reply) => set({ reply }),
  appendMessage: (message) =>
    set((current) => ({ messages: [...current.messages, message] })),
  setScopedReleaseId: (releaseId) => set({ scopedReleaseId: releaseId }),
  setRailOpen: (open) => {
    set({ railOpen: open });
    // Actions only ever run client-side, so writing storage here is safe.
    writePersistedState(RAIL_OPEN_KEY, RAIL_OPEN_VERSION, open);
  },
  reset: () => set({ input: '', reply: null, messages: [] }),
}));
