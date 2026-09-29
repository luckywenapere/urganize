/**
 * A message in a release's chat thread (Release & Task Chat, Phase 1).
 *
 * Structural twin of `TaskComment` (types/tasks.ts) — `release_id` in place
 * of `task_id` — because `release_messages` is a structural twin of
 * `task_comments` in the schema. See the migration's header comment for why
 * the two stayed separate tables rather than one shared shape.
 */
export type ReleaseMessage = {
  id: string;
  releaseId: string;
  userId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  authorName: string;
  authorEmail: string | null;
  authorInitials: string;
  isOwnMessage: boolean;
};
