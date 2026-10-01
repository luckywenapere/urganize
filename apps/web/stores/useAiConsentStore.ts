import { create } from 'zustand';

import { hasAiConsent, isAiConsentEnabled } from '@/lib/ai-consent';
import { useAuthStore } from '@/lib/auth-store';

/**
 * The open/closed state of the AI permission screen, and the people waiting on
 * its answer. The screen itself is components/ai/AiConsentSheet.tsx, mounted
 * once by AppShell; this store is how any code path (the chat's send, the
 * microphone, the rollout planner, the fetch hook for a 403) asks the question
 * and gets a yes or no back.
 */
type AiConsentState = {
  open: boolean;
  waiters: Array<(agreed: boolean) => void>;
  ask: () => Promise<boolean>;
  answer: (agreed: boolean) => void;
};

export const useAiConsentStore = create<AiConsentState>((set, get) => ({
  open: false,
  waiters: [],
  ask: () =>
    new Promise<boolean>((resolve) => {
      set((state) => ({ open: true, waiters: [...state.waiters, resolve] }));
    }),
  answer: (agreed) => {
    const { waiters } = get();
    set({ open: false, waiters: [] });
    for (const resolve of waiters) resolve(agreed);
  },
}));

/**
 * Resolves true when this person has agreed to send their words to our AI
 * partners (asking them first if they have not). Call it right before doing
 * anything that reaches an AI. With the feature off, or nobody signed in, it
 * answers true and asks nothing: other gates own those cases.
 */
export async function ensureAiConsent(): Promise<boolean> {
  if (!isAiConsentEnabled()) return true;
  const user = useAuthStore.getState().user;
  if (!user) return true;
  if (hasAiConsent(user.ai_consent_at)) return true;
  return useAiConsentStore.getState().ask();
}
