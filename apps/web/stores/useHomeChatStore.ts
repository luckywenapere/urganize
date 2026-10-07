import { create } from 'zustand';

/**
 * Which side of desktop Home's right column is showing (2026-10-07): the live
 * UrgAns conversation, or the list of past sessions. A store rather than local
 * state so the top bar's "UrgAns sessions" item can open the list from any
 * page. Not saved: a reload starts on the conversation.
 */
export type HomeChatPane = 'chat' | 'sessions';

type HomeChatState = {
  pane: HomeChatPane;
  setPane: (pane: HomeChatPane) => void;
};

export const useHomeChatStore = create<HomeChatState>((set) => ({
  pane: 'chat',
  setPane: (pane) => set({ pane }),
}));
