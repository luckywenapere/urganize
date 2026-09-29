'use client';

import { NotificationsSettingsSection } from '../NotificationsSettingsSection';

/**
 * Everything that can reach out to the person: push, the after-a-task check-in
 * and the weekly nudge. The section always renders (the nudge row is
 * deliberately ungated), so this segment can never open empty.
 */
export function NotificationsSegment() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <NotificationsSettingsSection />
    </div>
  );
}
