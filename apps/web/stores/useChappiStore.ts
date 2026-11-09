'use client';

import { registerSignOutReset } from '@/lib/sign-out-resets';
import { create } from 'zustand';
import type {
  ChappiAttachment,
  ChappiMessage,
  ChappiPendingConfirmation,
  ChappiReply,
} from '@/lib/chappi/types';
import { writePersistedState } from '@/lib/persisted-state';
import { DEFAULT_RAIL_WIDTH, RAIL_WIDTH_KEY, RAIL_WIDTH_VERSION } from '@/lib/rail-width';
import { isChappiHistoryEnabled, newChatId } from '@/lib/chappi/conversation-history';

// The transcript on screen. With NEXT_PUBLIC_FEATURE_URGANS_HISTORY off it is
// transient — no DB table, no localStorage — so a reload starts the assistant
// fresh. With the flag on it is SAVED, but not by this store: the history
// store (stores/useChappiHistoryStore.ts) subscribes to it, one way, and
// writes the browser copy and the server copy. This store only carries the
// transcript's identity (`conversationId`, `epoch`, `restoredCount`), so it
// never imports the history store and the two cannot form an import cycle.
//
// `railOpen` / `railWidth` are pure UI-chrome state, persisted like the dock's
// open state so a reload doesn't snap the layout.
//
// `pendingConfirmation` is never saved, with or without history, and that is
// the correct behaviour: a reload drops the card, and since nothing was
// executed, dropping it is the safe outcome — the user simply asks again. A
// saved card would let someone approve a stale action days later.

const HISTORY_ENABLED = isChappiHistoryEnabled();

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
  /** Metadata for the last assistant reply: the only source of the
   * Follow-up suggestions. Never saved. */
  reply: ChappiReply | null;
  /** The transcript on screen. */
  messages: ChappiMessage[];
  /** Which saved chat the transcript is, or null before its first message.
   * Assigned by the first `appendMessage` when chat history is on (a v4 uuid
   * the browser chooses, so a chat exists before its first save lands). Always
   * null with history off. */
  conversationId: string | null;
  /** How many of `messages` were RESTORED (loaded from history) rather than
   * added in this session. Retry is only offered on a message added this
   * session — regenerating yesterday's reply would re-run its tools and bill an
   * action — and "is a conversation in progress" readers count live turns
   * only (selectLiveTurnCount). Always 0 with history off. */
  restoredCount: number;
  /** The id the NEXT first message should create its chat under, instead of a
   * random one. Home's permanent chat uses it (lib/chappi/home-chat.ts). Cleared
   * by anything that replaces the transcript. */
  nextChatId: string | null;
  setNextChatId: (id: string | null) => void;
  /** Release the conversation is pinned to via the scope picker under the
   * prompt box; null = all releases. Survives `reset` deliberately — picking
   * a release is a working-context choice, not part of one conversation. */
  scopedReleaseId: string | null;
  /** The record in the making the box was on when this chat was sent from it
   * (lib/chappi/record-scope.ts). On a phone the box on a record page hands the
   * message to the UrgAns tab, so the id rides here. Unlike the release scope
   * it belongs to one conversation: anything that replaces the transcript
   * clears it. */
  scopedRecordId: string | null;
  setScopedRecordId: (recordId: string | null) => void;
  /** Whether the UrgAns chat card in the right-hand column (RightRail, mounted
   * by AppShell on every chrome page at lg+; the rollout menu shares that
   * column and stays whether or not this is open) is open. Survives navigation
   * by living here and reloads via localStorage; deliberately NOT part of
   * `reset` — closing a conversation shouldn't collapse the layout. */
  railOpen: boolean;
  /** Width in px of the right-hand column WHILE THE CHAT IS OPEN. Always a whole
   * number inside the absolute range; RightRail clamps it again to whatever THIS
   * viewport can pay for. With the chat closed the column is not this wide (it
   * is the menu-only width, lib/rail-width.ts's RAIL_MENU_ONLY_WIDTH), and this
   * number is kept so reopening the chat restores the width that was dragged. */
  railWidth: number;
  /** An action the model has PROPOSED and the user has not yet approved.
   * Nothing has run while this is set. Cleared by `reset`, by
   * `truncateFromMessage` (a regenerated reply must not leave a stale card
   * behind), and by the client before every new user turn. */
  pendingConfirmation: ChappiPendingConfirmation | null;
  /** Bumped every time the transcript is replaced wholesale rather than
   * appended to: "New chat", sign-out, and opening a saved chat. Async work
   * (an agent reply, an upload finishing) captures it when its turn starts and
   * treats a change as "the conversation this belongs to is no longer on
   * screen", so a late reply can never land in a different chat or, after a
   * same-tab sign-out, in a different account's. */
  epoch: number;
  /** Set by a box outside the chat (Home's) that wants its text sent as soon
   * as a conversation is on screen. The conversation clears it when it sends. */
  sendInputOnOpen: boolean;
  setSendInputOnOpen: (value: boolean) => void;
  /** True while the conversation on screen is waiting on a reply. Published by
   * ChappiConversation so a composer outside it (the swipe navigation's one
   * shared box, URG-380) can show the same busy state. */
  replyInFlight: boolean;
  setReplyInFlight: (value: boolean) => void;
  /** Files attached in Home's box, sent along with its message. */
  pendingAttachments: ChappiAttachment[];
  setPendingAttachments: (value: ChappiAttachment[]) => void;
  setInput: (value: string) => void;
  setReply: (reply: ChappiReply | null) => void;
  setPendingConfirmation: (pending: ChappiPendingConfirmation | null) => void;
  appendMessage: (message: ChappiMessage) => void;
  /** Removes `messageId` and everything after it — the retry action's
   * "regenerate the last reply" primitive: drop the reply, keep the user
   * turn that produced it, re-submit. No-op when the id isn't found. */
  truncateFromMessage: (messageId: string) => void;
  /** Shows a saved chat: replaces the transcript wholesale, bumps `epoch`, and
   * marks every message as restored. Only the history store calls it. */
  loadConversation: (chat: { id: string; messages: ChappiMessage[] }) => void;
  /** Gives the transcript on screen a new chat id WITHOUT replacing it — the
   * "fork" outcome, when another tab wrote something different to the same
   * chat. Deliberately no epoch bump: the transcript is unchanged, so a reply
   * still in flight for it must keep landing here. */
  rekeyConversation: (id: string) => void;
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
  /** "New chat": empties the transcript and bumps `epoch`. Keeps the scope
   * picker and the rail layout, which are working-context choices. */
  reset: () => void;
  /** Sign-out: everything `reset` clears PLUS the scope picker, which on a
   * same-tab account switch would otherwise hand account B a release id from
   * account A. Called from the SIGNED_OUT branch in lib/auth-store.ts. The
   * rail's open state and width are device preferences, so they stay. */
  resetForSignOut: () => void;
};

export const useChappiStore = create<ChappiStore>((set) => ({
  input: '',
  reply: null,
  messages: [],
  conversationId: null,
  restoredCount: 0,
  nextChatId: null,
  setNextChatId: (id) => set({ nextChatId: id }),
  scopedReleaseId: null,
  scopedRecordId: null,
  setScopedRecordId: (recordId) => set({ scopedRecordId: recordId }),
  railOpen: false,
  railWidth: DEFAULT_RAIL_WIDTH,
  pendingConfirmation: null,
  epoch: 0,
  sendInputOnOpen: false,
  setSendInputOnOpen: (value) => set({ sendInputOnOpen: value }),
  replyInFlight: false,
  setReplyInFlight: (value) => set({ replyInFlight: value }),
  pendingAttachments: [],
  setPendingAttachments: (value) => set({ pendingAttachments: value }),
  setInput: (value) => set({ input: value }),
  setReply: (reply) => set({ reply }),
  setPendingConfirmation: (pending) => set({ pendingConfirmation: pending }),
  appendMessage: (message) =>
    set((current) => ({
      messages: [...current.messages, message],
      // The id is minted in the SAME update as the first message, so the
      // history store never sees a chat with messages and no id.
      conversationId:
        current.conversationId ?? (HISTORY_ENABLED ? current.nextChatId ?? newChatId() : null),
      nextChatId: null,
    })),
  truncateFromMessage: (messageId) =>
    set((current) => {
      const index = current.messages.findIndex((message) => message.id === messageId);
      if (index === -1) return {};
      // Clear `reply` too: its suggestions belong to the reply being dropped.
      // Same for any pending card — the reply that proposed it is going away.
      return {
        messages: current.messages.slice(0, index),
        restoredCount: Math.min(current.restoredCount, index),
        reply: null,
        pendingConfirmation: null,
      };
    }),
  loadConversation: (chat) =>
    set((current) => ({
      messages: chat.messages,
      conversationId: chat.id,
      restoredCount: chat.messages.length,
      nextChatId: null,
      reply: null,
      pendingConfirmation: null,
      scopedRecordId: null,
      epoch: current.epoch + 1,
    })),
  rekeyConversation: (id) => set({ conversationId: id }),
  setScopedReleaseId: (releaseId) => set({ scopedReleaseId: releaseId }),
  setRailOpen: (open) => {
    set({ railOpen: open });
    // Actions only ever run client-side, so writing storage here is safe.
    // Guarded like setRailWidth below: setItem throws on a full quota and in
    // Safari private mode, and an open state that could not be saved should
    // still apply for this session.
    try {
      writePersistedState(RAIL_OPEN_KEY, RAIL_OPEN_VERSION, open);
    } catch {
      // Nothing to undo — the in-memory state above already changed.
    }
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
  reset: () =>
    set((current) => ({
      input: '',
      reply: null,
      messages: [],
      conversationId: null,
      restoredCount: 0,
      nextChatId: null,
      pendingConfirmation: null,
      scopedRecordId: null,
      epoch: current.epoch + 1,
    })),
  resetForSignOut: () =>
    set((current) => ({
      input: '',
      // A message handed over from Home and not yet sent belongs to the
      // account that wrote it. Left set, the next account's first chat sent
      // the previous account's files.
      sendInputOnOpen: false,
      pendingAttachments: [],
      reply: null,
      messages: [],
      conversationId: null,
      restoredCount: 0,
      nextChatId: null,
      pendingConfirmation: null,
      scopedReleaseId: null,
      scopedRecordId: null,
      epoch: current.epoch + 1,
    })),
}));

/**
 * Turns added in THIS session. A restored chat is on screen but not "in
 * progress": the first-release prompt and the usage strip
 * read this instead of `messages.length`, so reopening yesterday's chat does
 * not silence them for the whole session. Identical to `messages.length` when
 * history is off, because `restoredCount` is then always 0.
 */
export const selectLiveTurnCount = (state: {
  messages: ChappiMessage[];
  restoredCount: number;
}): number => Math.max(0, state.messages.length - state.restoredCount);

// Sign-out: see lib/sign-out-resets.ts (runs from lib/auth-store.ts).
registerSignOutReset('chappi', () => useChappiStore.getState().resetForSignOut());
