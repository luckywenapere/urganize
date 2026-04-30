'use client';

import { create } from 'zustand';
import type { AISignal, ExecutionRelease, ExecutionTask, ReleasePipelineState } from '@/lib/execution-types';
import { requestMockAISignals } from '@/services/mock-ai';

type AIStore = {
  signals: AISignal[];
  isLoading: boolean;
  runCheck: (input: {
    releases: ExecutionRelease[];
    tasks: ExecutionTask[];
    releaseId?: string | null;
    state?: ReleasePipelineState | null;
  }) => Promise<AISignal[]>;
  addSignals: (signals: AISignal[]) => void;
  clearReleaseSignals: (releaseId: string) => void;
};

export const useAIStore = create<AIStore>((set, get) => ({
  signals: [],
  isLoading: false,
  runCheck: async (input) => {
    set({ isLoading: true });
    const signals = await requestMockAISignals(input);
    set({
      isLoading: false,
      signals: [
        ...signals,
        ...get().signals.filter((existing) => !signals.some((signal) => signal.id === existing.id)),
      ].slice(0, 30),
    });
    return signals;
  },
  addSignals: (signals) =>
    set((state) => ({
      signals: [...signals, ...state.signals].slice(0, 30),
    })),
  clearReleaseSignals: (releaseId) =>
    set((state) => ({
      signals: state.signals.filter((signal) => signal.releaseId !== releaseId),
    })),
}));
