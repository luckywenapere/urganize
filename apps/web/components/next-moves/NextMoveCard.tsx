'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, Sparkles, X } from '@/components/icons';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { useOpenSettings } from '@/components/settings/useOpenSettings';
import { NEXT_MOVE_COPY, type NextMove } from '@/lib/next-moves';

/**
 * One next move (URG-259): a verb title, one short line, one button, and a
 * "Not now" cross that hides it for good. The whole card is the button, the
 * same stretched-link pattern as Home's For you today cards, so a folded top
 * card is as easy to tap as an open one. The cross sits above the stretch.
 */
export function NextMoveCard({
  move,
  showRollout,
  onDismiss,
}: {
  move: NextMove;
  /** Name the rollout (Home, where several share the list). */
  showRollout: boolean;
  onDismiss: (move: NextMove) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { openTask } = useTaskUI();
  const openSettings = useOpenSettings();

  const go = () => {
    if (move.target.kind === 'link') {
      router.push(move.target.href);
      return;
    }
    if (move.target.kind === 'settings') {
      openSettings({ segment: move.target.segment, section: move.target.section });
      return;
    }
    const href = `/dashboard?release=${encodeURIComponent(move.target.releaseId)}`;
    const here =
      pathname === '/dashboard' &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('release') === move.target.releaseId;
    if (!here) router.push(href);
    // Route-agnostic, so racing the navigation is safe (the bell does the same).
    openTask(move.target.taskId);
  };

  return (
    <div className="flex items-start gap-3" data-next-move={move.rule}>
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"
        aria-hidden="true"
      >
        <Sparkles className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 pr-7">
        <button
          type="button"
          onClick={go}
          className="motion-focus block text-left text-sm font-semibold text-content-primary after:absolute after:inset-0 after:rounded-2xl after:content-['']"
        >
          {move.title}
        </button>
        <span className="mt-0.5 block text-xs text-content-secondary">
          {showRollout ? `${move.releaseTitle} · ${move.detail}` : move.detail}
        </span>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand">
          {move.action}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </span>
      <button
        type="button"
        onClick={() => onDismiss(move)}
        aria-label={`${NEXT_MOVE_COPY.dismiss}: ${move.title}`}
        title={NEXT_MOVE_COPY.dismiss}
        className="motion-focus absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-elevated hover:text-content-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
