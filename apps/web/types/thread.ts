/**
 * The generic shape a thread message renders as — the presentational
 * `ThreadMessageList` / `ThreadComposer` pair (components/threads/) accept
 * this rather than either concrete message type directly, so the task
 * thread and the release thread can share one set of markup.
 *
 * Mirrors `TaskComment` (types/tasks.ts) field for field except
 * `isOwnMessage`, which is the generic name — `TaskComment` keeps its own
 * `isOwnComment` to avoid touching an already-shipped type, and each feeding
 * component does the trivial rename when it builds this shape.
 */
export type ThreadMessage = {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  authorName: string;
  authorEmail: string | null;
  authorInitials: string;
  isOwnMessage: boolean;
};
