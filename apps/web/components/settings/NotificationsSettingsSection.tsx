'use client';

import { panelClass } from './panelClass';
import { PushNotificationsSection } from './PushNotificationsSection';
import { TaskCheckInSection } from './TaskCheckInSection';
import { MotivationalNudgesSection } from './MotivationalNudgesSection';

/**
 * Every notification preference in one place (2026-08-13).
 *
 * These three toggles used to be three sections: Push notifications sat in a
 * two-column row beside Appearance, then After tasks and Motivation followed as
 * separate full-width bands. Nothing told the user they were one set, and each
 * spent a py-9 band and a mono kicker on a single button.
 *
 * Each row keeps its own gate, and the gates are genuinely different — push
 * hides when the device can't do it, After tasks hides behind
 * NEXT_PUBLIC_FEATURE_TASK_OUTCOMES, Motivation is deliberately unconditional.
 * That last one is why this section can render unconditionally: there is always
 * at least one row, so the Notifications tab is never an empty page.
 */
export function NotificationsSettingsSection() {
  return (
    // No kicker of its own since 2026-09-29: the pop-up's pane already carries
    // the segment title, and "Notifications" twice in a row is noise.
    <section className={panelClass}>
      <div className="divide-y divide-stroke-subtle">
        <PushNotificationsSection />
        <TaskCheckInSection />
        <MotivationalNudgesSection />
      </div>
    </section>
  );
}
