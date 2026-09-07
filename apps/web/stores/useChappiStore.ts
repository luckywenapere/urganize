'use client';

import { create } from 'zustand';
import type {
  ChappiMessage,
  ChappiPendingConfirmation,
  ChappiReply,
} from '@/lib/chappi/types';
import { writePersistedState } from '@/lib/persisted-state';
import { DEFAULT_RAIL_WIDTH, RAIL_WIDTH_KEY, RAIL_WIDTH_VERSION } from '@/lib/rail-width';

// CONVERSATION state is transient, NOT persisted — no DB table, no
// localStorage — so a reload starts the assistant fresh. `messages` is
// reserved for the Phase 2 agentic loop; Phase 1 only uses `input` + `reply`.
// The one exception is `railOpen` below: pure UI-chrome state (is the side
// rail showing), persisted like the dock's open state so a reload doesn't
// snap the layout.
//
// `pendingConfirmation` is transient for the same reason and that is the
// correct behaviour: a reload drops the card, and since nothing was executed,
// dropping it is the safe outcome — the user simply asks again.

// Side-rail open state — same lib/persisted-state pattern as ChappiDock's
// DOCK_OPEN_KEY. Written by setRailOpen; hydrated once by AppShell in a
// mount effect (SSR-safe: first paint always renders closed).
export const RAIL_OPEN_KEY = 'urganize.chappi.rail-open';
export const RAIL_OPEN_VERSION = 1;

// Side-rail WIDTH, in px, persisted the same way. Bounds, clamping and the
// storage validator all live in lib/rail-width.ts; this store only holds the
// number. Hydrated once by AppShell, so first paint always renders the
// default and a stored width never reaches a render-time storage read.

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
  /** Side-rail width in px. Always a whole number inside the absolute range;
   * the component clamps it again to whatever THIS viewport can pay for. */
  railWidth: number;
  /** An action the model has PROPOSED and the user has not yet approved.
   * Nothing has run while this is set. Cleared by `reset`, by
   * `truncateFromMessage` (a regenerated reply must not leave a stale card
   * behind), and by the client before every new user turn. */
  pendingConfirmation: ChappiPendingConfirmation | null;
  setInput: (value: string) => void;
  setReply: (reply: ChappiReply | null) => void;
  setPendingConfirmation: (pending: ChappiPendingConfirmation | null) => void;
  appendMessage: (message: ChappiMessage) => void;
  /** Removes `messageId` and everything after it — the retry action's
   * "regenerate the last reply" primitive: drop the reply, keep the user
   * turn that produced it, re-submit. No-op when the id isn't found. */
  truncateFromMessage: (messageId: string) => void;
  setScopedReleaseId: (releaseId: string | null) => void;
  /** Opens/closes the side rail AND persists the choice — a user close
   * stays closed across pages and reloads until they reopen it (or a new
   * session lands on the assistant page again; see AppShell's arming
   * effect). */
  setRailOpen: (open: boolean) => void;
  /** Sets the rail's width AND persists it. Called once when a drag ENDS,
   * never per pointermove: writePersistedState does not guard setItem, so a
   * per-frame write would hammer storage and throw on a full quota. */
  setRailWidth: (width: number) => void;
  /** Applies a stored width without writing it back. AppShell's mount effect
   * is the only caller — writing here would re-save a value we just read. */
  hydrateRailWidth: (width: number) => void;
  reset: () => void;
};

export const useChappiStore = create<ChappiStore>((set) => ({
  input: '',
  reply: null,
  messages: [],
  scopedReleaseId: null,
  railOpen: false,
  railWidth: DEFAULT_RAIL_WIDTH,
  pendingConfirmation: null,
  setInput: (value) => set({ input: value }),
  setReply: (reply) => set({ reply }),
  setPendingConfirmation: (pending) => set({ pendingConfirmation: pending }),
  appendMessage: (message) =>
    set((current) => ({ messages: [...current.messages, message] })),
  truncateFromMessage: (messageId) =>
    set((current) => {
      const index = current.messages.findIndex((message) => message.id === messageId);
      if (index === -1) return {};
      // Clear `reply` too: its suggestions belong to the reply being dropped.
      // Same for any pending card — the reply that proposed it is going away.
      return { messages: current.messages.slice(0, index), reply: null, pendingConfirmation: null };
    }),
  setScopedReleaseId: (releaseId) => set({ scopedReleaseId: releaseId }),
  setRailOpen: (open) => {
    set({ railOpen: open });
    // Actions only ever run client-side, so writing storage here is safe.
    writePersistedState(RAIL_OPEN_KEY, RAIL_OPEN_VERSION, open);
  },
  setRailWidth: (width) => {
    set({ railWidth: width });
    try {
      writePersistedState(RAIL_WIDTH_KEY, RAIL_WIDTH_VERSION, width);
    } catch {
      // Quota exceeded, or Safari private mode where getItem works and
      // setItem throws. A width that could not be saved still applies for
      // this session, which is the right way round to fail.
    }
  },
  hydrateRailWidth: (width) => set({ railWidth: width }),
  reset: () => set({ input: '', reply: null, messages: [], pendingConfirmation: null }),
}));
