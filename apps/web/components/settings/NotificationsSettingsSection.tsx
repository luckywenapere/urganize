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
    <section className={panelClass}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Notifications
      </h2>
      <div className="divide-y divide-stroke-subtle">
        <PushNotificationsSection />
        <TaskCheckInSection />
        <MotivationalNudgesSection />
      </div>
    </section>
  );
}
