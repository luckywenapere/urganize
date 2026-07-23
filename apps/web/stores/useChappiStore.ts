'use client';

import { create } from 'zustand';
import type { ChappiMessage, ChappiReply } from '@/lib/chappi/types';

// Transient, NOT persisted. Conversation state is ephemeral by design — no DB
// table, no localStorage — so a reload starts Chappi fresh. `messages` is
// reserved for the Phase 2 agentic loop; Phase 1 only uses `input` + `reply`.
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
  setInput: (value: string) => void;
  setReply: (reply: ChappiReply | null) => void;
  appendMessage: (message: ChappiMessage) => void;
  setScopedReleaseId: (releaseId: string | null) => void;
  reset: () => void;
};

export const useChappiStore = create<ChappiStore>((set) => ({
  input: '',
  reply: null,
  messages: [],
  scopedReleaseId: null,
  setInput: (value) => set({ input: value }),
  setReply: (reply) => set({ reply }),
  appendMessage: (message) =>
    set((current) => ({ messages: [...current.messages, message] })),
  setScopedReleaseId: (releaseId) => set({ scopedReleaseId: releaseId }),
  reset: () => set({ input: '', reply: null, messages: [] }),
}));
