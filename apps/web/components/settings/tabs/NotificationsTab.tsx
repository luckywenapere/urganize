'use client';

import { NotificationsSettingsSection } from '../NotificationsSettingsSection';

/**
 * Everything that can reach out to the user.
 *
 * One section holding three rows (push, after-tasks check-in, weekly
 * motivation). Those were three separate full-width sections on the flat page,
 * never adjacent as the one set they are — see
 * NotificationsSettingsSection for why the section renders unconditionally and
 * how each row keeps its own gate.
 */
export function NotificationsTab() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <NotificationsSettingsSection />
    </div>
  );
}
