import { create } from 'zustand';

/**
 * Which conversation Home's chat shows (2026-10-10): Home's permanent chat, or
 * a separate session the person opened. Sessions are listed on the UrgAns page
 * (2026-10-26); Home itself has no list.
 */
export type HomeChatMode = 'home' | 'session';

/** Where the fold of Home's left column is remembered on this device. */
export const HOME_LIST_COLLAPSED_KEY = 'urganize.home.list-collapsed';
export const HOME_LIST_COLLAPSED_VERSION = 1;

type HomeChatState = {
  mode: HomeChatMode;
  setMode: (mode: HomeChatMode) => void;
  /** Home's left column is folded away so the conversation fills the width. */
  listCollapsed: boolean;
  toggleListCollapsed: () => void;
  setListCollapsed: (collapsed: boolean) => void;
};

export const useHomeChatStore = create<HomeChatState>((set) => ({
  mode: 'home',
  setMode: (mode) => set({ mode }),
  listCollapsed: false,
  toggleListCollapsed: () => set((state) => ({ listCollapsed: !state.listCollapsed })),
  setListCollapsed: (collapsed) => set({ listCollapsed: collapsed }),
}));
