'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from '@/components/icons';
import { useSessionsViewStore } from '@/stores/useSessionsViewStore';

/** How long the pill waits for a tap before it fades. */
export const BACK_PILL_MS = 6000;

/**
 * The brief "Back to <rollout>" pill (Nov 2, 2026, founder call): after a
 * message typed on a rollout page opens that rollout's session, this shows for
 * a few seconds under the tabs, and a tap glides straight back to the page the
 * person was on. Swiping stays the ordinary swiping between tabs. Phone only,
 * like the whole swipe shell.
 */
export function BackPill({ active }: { active: boolean }) {
  const router = useRouter();
  const backTo = useSessionsViewStore((state) => state.backTo);
  const setBackTo = useSessionsViewStore((state) => state.setBackTo);

  // It fades on its own, and goes the moment the person leaves the tab.
  useEffect(() => {
    if (!backTo) return;
    if (!active) {
      setBackTo(null);
      return;
    }
    const timer = window.setTimeout(() => setBackTo(null), BACK_PILL_MS);
    return () => window.clearTimeout(timer);
  }, [backTo, active, setBackTo]);

  if (!backTo || !active) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+62px)] z-[60] flex justify-center">
      <button
        type="button"
        onClick={() => {
          const { href } = backTo;
          setBackTo(null);
          router.push(href);
        }}
        className="swipe-back-pill motion-focus motion-press pointer-events-auto inline-flex min-h-10 max-w-[80vw] items-center gap-1 rounded-full bg-content-primary px-4 text-[13px] font-semibold text-bg-base shadow-lg"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Back to {backTo.label}</span>
      </button>
    </div>
  );
}
