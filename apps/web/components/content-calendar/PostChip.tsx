'use client';

import type { ContentPost } from '@/types/content-calendar';
import { canQuickTogglePosted, isPostOverdue } from '@/lib/content-calendar';
import { getStatusLabel, StatusMark } from './StatusMark';

/**
 * Shared chip renderer for MonthGrid (desktop grid) and AgendaList (mobile),
 * so the two surfaces show pixel-identical chips (URG-157, Phase A).
 *
 * A plain <div> wrapper, not a <button>: it holds two SIBLING interactive
 * controls (the StatusMark toggle button and the title button), never one
 * nested inside the other, the same pattern TaskCompletionCheckbox's row
 * usage establishes elsewhere in the app, and the only way to keep both
 * independently clickable without nesting <button> inside <button>.
 */

type PostChipProps = {
  post: ContentPost;
  today: string;
  onOpen: (post: ContentPost) => void;
  onToggleStatus: (post: ContentPost) => void;
};

export function PostChip({ post, today, onOpen, onToggleStatus }: PostChipProps) {
  const overdue = isPostOverdue(post, today);
  const canToggle = canQuickTogglePosted(post, today);
  const statusText = `${getStatusLabel(post.status)}${overdue ? ', overdue' : ''}`;

  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-sm bg-[var(--cc-fill)] px-1.5 py-1">
      <StatusMark
        status={post.status}
        overdue={overdue}
        canToggle={canToggle}
        onToggle={() => onToggleStatus(post)}
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(post);
        }}
        aria-label={`${post.title}, ${statusText}`}
        title={post.title}
        className="min-w-0 flex-1 truncate text-left text-[11px] font-medium leading-4 text-[var(--cc-on-fill)] hover:underline"
      >
        {post.title}
      </button>
    </div>
  );
}
