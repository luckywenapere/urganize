import { create } from 'zustand';

/**
 * Which side of desktop Home's right column is showing (2026-10-07): the live
 * UrgAns conversation, or the list of past sessions. A store rather than local
 * state so the top bar's "UrgAns sessions" item can open the list from any
 * page. Not saved: a reload starts on the conversation.
 */
export type HomeChatPane = 'chat' | 'sessions';

/**
 * Which conversation the 'chat' pane shows (2026-10-10): Home's permanent chat,
 * or a separate session the person started or opened from Sessions.
 */
export type HomeChatMode = 'home' | 'session';

type HomeChatState = {
  pane: HomeChatPane;
  setPane: (pane: HomeChatPane) => void;
  mode: HomeChatMode;
  setMode: (mode: HomeChatMode) => void;
};

export const useHomeChatStore = create<HomeChatState>((set) => ({
  pane: 'chat',
  setPane: (pane) => set({ pane }),
  mode: 'home',
  setMode: (mode) => set({ mode }),
}));
