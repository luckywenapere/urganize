'use client';

import { UrgansActivityList } from './UrgansActivityList';

/** "What UrgAns did" on the UrgAns page (2026-10-29, #849): the one place the
 *  history lives. Pick a rollout, or see them all, and filter by who asked. */
export function UrgansActivityView() {
  return (
    <div className="h-full min-h-0 overflow-y-auto pb-6">
      <h2 className="text-base font-semibold text-content-primary">What AI did</h2>
      <p className="mb-4 mt-1 text-sm text-content-secondary">
        Every change AI made in the last 30 days, and who asked for it.
      </p>
      <UrgansActivityList showRolloutPicker showPersonFilter />
    </div>
  );
}
