import { stripModelMarkup } from '@/lib/model-markup';

// What a screen reader is told when the UrgAns transcript changes.
//
// The transcript is plain markup: a reply appearing, "Thinking…" showing, or a
// permission card being proposed changes the page without announcing anything,
// and focus stays in the composer. So someone using a screen reader sent a
// message and never heard the answer, or the question that has to be approved
// before anything happens. One live region carries a single line at a time,
// chosen by what is most urgent: a question waiting on the person beats a
// spinner beats the last reply.
export function describeTranscriptAnnouncement(state: {
  isThinking: boolean;
  pendingConfirmation: { title: string; detail?: string | null } | null;
  lastAssistantContent: string | null;
}): string {
  if (state.pendingConfirmation && !state.isThinking) {
    const { title, detail } = state.pendingConfirmation;
    return [title, detail, 'Approve or cancel below.'].filter(Boolean).join(' ');
  }
  if (state.isThinking) return 'AI is thinking.';
  return state.lastAssistantContent ? stripModelMarkup(state.lastAssistantContent) : '';
}
