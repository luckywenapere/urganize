'use client';

import { SessionsPane } from '@/components/shell/swipe/SessionsPane';

/**
 * Rollouts on a computer (Nov 2, 2026, founder approved docs/mocks/desktop-nav):
 * the rollouts list on the left, the open rollout's chat on the right. On a
 * phone the swipe shell draws its own Rollouts tab and this page is not shown.
 */
export default function SessionsPageClient() {
  return (
    <div className="h-[calc(100dvh-8.5rem)] min-h-[28rem]">
      <SessionsPane active split />
    </div>
  );
}
