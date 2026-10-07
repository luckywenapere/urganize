'use client';

import { create } from 'zustand';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import {
  CHAT_SIDE_KEY,
  CHAT_SIDE_VERSION,
  DEFAULT_CHAT_SIDE,
  isChatSideMode,
  toggleChatSide,
  type ChatSideMode,
} from '@/lib/chat-side';

type ChatSideState = {
  mode: ChatSideMode;
  hydrated: boolean;
  hydrate: () => void;
  setMode: (mode: ChatSideMode) => void;
  toggle: (target: 'today' | 'history') => void;
};

function save(mode: ChatSideMode) {
  try {
    writePersistedState(CHAT_SIDE_KEY, CHAT_SIDE_VERSION, mode);
  } catch {
    // Storage full or blocked: the choice still holds for this session.
  }
}

export const useChatSideStore = create<ChatSideState>((set, get) => ({
  mode: DEFAULT_CHAT_SIDE,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    const stored = readPersistedState(CHAT_SIDE_KEY, CHAT_SIDE_VERSION, isChatSideMode);
    set({ mode: stored ?? DEFAULT_CHAT_SIDE, hydrated: true });
  },
  setMode: (mode) => {
    set({ mode, hydrated: true });
    save(mode);
  },
  toggle: (target) => get().setMode(toggleChatSide(get().mode, target)),
}));
