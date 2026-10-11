'use client';

import { memo } from 'react';
import { NotificationsSettingsSection } from '../NotificationsSettingsSection';

/**
 * Everything that can reach out to the person: push, the after-a-task check-in
 * and the weekly nudge. The section always renders (the nudge row is
 * deliberately ungated), so this segment can never open empty.
 */
function NotificationsSegmentView() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <NotificationsSettingsSection />
    </div>
  );
}

/**
 * Memoised (2026-10-11): every segment opened in this visit stays mounted, and
 * the dialog re-renders on each keystroke in its search box and each dirty or
 * URL change, which used to re-render every one of them. Measured as a 304ms
 * INP on the Team segment. With stable props it now re-renders only when its
 * own inputs change.
 */
export const NotificationsSegment = memo(NotificationsSegmentView);
