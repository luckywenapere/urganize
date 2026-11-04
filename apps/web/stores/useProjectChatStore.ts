import { create } from 'zustand';
import { useChappiStore } from '@/stores/useChappiStore';

// The project page's own AI sheet on a phone (2026-11-04, #1074, mock screen
// 6): which project's conversation is open over its page, or none. Opened by
// the page's box when it sends, so the conversation stays on the page instead
// of moving to the AI tab.
type ProjectChatState = {
  openRecordId: string | null;
  open: (recordId: string) => void;
  close: () => void;
};

export const useProjectChatStore = create<ProjectChatState>((set, get) => ({
  openRecordId: null,
  open: (recordId) => set({ openRecordId: recordId }),
  close: () => {
    const recordId = get().openRecordId;
    set({ openRecordId: null });
    // Leaving the sheet leaves the project: without this, a message typed on
    // the AI tab later would still be filed into it.
    const chappi = useChappiStore.getState();
    if (recordId && chappi.scopedRecordId === recordId) chappi.setScopedRecordId(null);
  },
}));
