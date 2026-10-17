'use client';

import { memo } from 'react';
import { NotificationsSettingsSection } from '../NotificationsSettingsSection';

/**
 * Push notifications for this device. The after-a-task check-in and weekly
 * nudge toggles left on 2026-10-17 (both always on). The push row always
 * renders something once its probe resolves, so this segment never opens
 * empty.
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
