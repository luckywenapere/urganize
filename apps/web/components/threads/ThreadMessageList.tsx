'use client';

import { useState } from 'react';
import { Loader2, MessageCircle, Pencil, Trash2 } from '@/components/icons';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { formatRelativeTime } from '@/lib/relative-time';
import type { ThreadMessage } from '@/types/thread';

type ThreadMessageListProps = {
  messages: ThreadMessage[];
  isLoading: boolean;
  loadError: string;
  onRetry: () => void;
  onEdit?: (messageId: string, content: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  emptyTitle: string;
  emptyBody: string;
};

/**
 * The message list half of a thread — shared between the task and release
 * chat (both feed it a `ThreadMessage[]`, mapped from their own concrete
 * type). No pagination: task threads and release threads are read-in-full,
 * matching the codebase's existing task_comments/task_activity precedent —
 * a rollout's own chat is not expected to grow past a few hundred rows.
 */
export function ThreadMessageList({
  messages,
  isLoading,
  loadError,
  onRetry,
  onEdit,
  onDelete,
  emptyTitle,
  emptyBody,
}: ThreadMessageListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="border border-status-error/30 bg-status-error/5 p-4">
        <p className="text-sm text-content-primary">We could not load this thread.</p>
        <p className="mt-1 text-xs text-content-secondary">{loadError}</p>
        <button
          type="button"
          onClick={onRetry}
          className="motion-focus mt-3 text-xs font-semibold text-brand hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="border border-dashed border-stroke-default p-8 text-center">
        <MessageCircle className="mx-auto h-5 w-5 text-content-tertiary" aria-hidden="true" />
        <p className="mt-3 text-sm text-content-primary">{emptyTitle}</p>
        <p className="mt-1 text-xs text-content-secondary">{emptyBody}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {messages.map((message) => (
        <ThreadMessageRow key={message.id} message={message} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function ThreadMessageRow({
  message,
  onEdit,
  onDelete,
}: {
  message: ThreadMessage;
  onEdit?: (messageId: string, content: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [rowError, setRowError] = useState('');

  const canModify = message.isOwnMessage && (onEdit || onDelete);

  const handleSaveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      setDraft(message.content);
      return;
    }

    setIsSaving(true);
    setRowError('');
    try {
      await onEdit?.(message.id, trimmed);
      setIsEditing(false);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not save the edit.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    setIsDeleting(true);
    setRowError('');
    try {
      await onDelete?.(message.id);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not delete the message.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <li className="flex gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-semibold text-content-secondary"
        aria-hidden="true"
      >
        {message.authorInitials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-content-primary">{message.authorName}</span>
          <span className="text-xs text-content-tertiary">{formatRelativeTime(message.createdAt)}</span>
          {message.editedAt ? <span className="text-xs text-content-tertiary">(edited)</span> : null}
        </div>

        {isEditing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="motion-focus min-h-[60px] w-full resize-y rounded-lg border border-stroke-default bg-bg-elevated px-2 py-1.5 text-sm text-content-primary"
            />
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={isSaving}
                className="motion-focus text-xs font-semibold text-brand hover:underline disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setDraft(message.content);
                }}
                className="motion-focus text-xs font-semibold text-content-tertiary hover:text-content-primary"
              >
                Cancel
              </button>
            </div>
            {rowError ? (
              <p className="mt-1 text-xs text-status-error" role="alert">
                {rowError}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm text-content-primary">{message.content}</p>
        )}

        {rowError && !isEditing ? (
          <p className="mt-1 text-xs text-status-error" role="alert">
            {rowError}
          </p>
        ) : null}

        {canModify && !isEditing ? (
          <div className="mt-1 flex items-center gap-1">
            {onEdit ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                aria-label="Edit message"
                className="motion-focus inline-flex h-6 w-6 items-center justify-center text-content-tertiary transition-colors hover:text-content-primary"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                aria-label="Delete message"
                className="motion-focus inline-flex h-6 w-6 items-center justify-center text-content-tertiary transition-colors hover:text-status-error disabled:opacity-60"
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
