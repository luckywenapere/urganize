'use client';

import { create } from 'zustand';
import type { VoiceReleaseScope } from '@/components/chappi/voice/useRealtimeVoice';

// Whether the Talk to UrgAns sheet is open, and for which rollout. The sheet
// itself is mounted ONCE, by AppShell (VoiceSheetHost), so a call survives the
// composer re-rendering from the empty landing to the active thread and the
// user moving between pages; the Talk buttons only open it.

type VoiceCallStore = {
  open: boolean;
  releaseScope: VoiceReleaseScope;
  openCall: (releaseScope: VoiceReleaseScope) => void;
  close: () => void;
};

export const useVoiceCallStore = create<VoiceCallStore>((set) => ({
  open: false,
  releaseScope: null,
  openCall: (releaseScope) => set({ open: true, releaseScope }),
  close: () => set({ open: false }),
}));
