'use client';

import { panelClass } from './panelClass';
import { MorningBriefSection } from './MorningBriefSection';
import { PushNotificationsSection } from './PushNotificationsSection';

/**
 * Every notification preference in one place (2026-08-13).
 *
 * Since 2026-10-17 (founder call) this is just Push notifications. The After
 * tasks check-in and the weekly Motivation nudge lost their toggles: no
 * outside user ever turned either off, so both are simply on for everyone
 * (lib/task-outcome-prompt.ts, lib/motivation-server.ts). Their profile
 * columns (ask_after_tasks, motivational_nudges) are kept and ignored; the
 * old row components stay in this folder, unrendered.
 *
 * The morning brief (#1207, 11 Nov 2026) has a row of its own: it is a daily
 * message in the Assistant chat, and the approved mock promised a way to turn
 * it off.
 *
 * The push row always renders something (a one-line note when the device
 * can't do push), so the Notifications tab is never an empty page.
 */
export function NotificationsSettingsSection() {
  return (
    // No kicker of its own since 2026-09-29: the pop-up's pane already carries
    // the segment title, and "Notifications" twice in a row is noise.
    <section className={panelClass}>
      <div className="divide-y divide-stroke-subtle">
        <PushNotificationsSection />
        <MorningBriefSection />
      </div>
    </section>
  );
}
