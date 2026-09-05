'use client';

import { useState } from 'react';
import { Sparkles } from '@/components/icons';

import { useAuthStore } from '@/lib/auth-store';
import { SettingRow, settingRowButtonClass } from './SettingRow';

// Weekly motivational push opt-out (mobile push notifications, 2026-08-10).
// Mirrors TaskCheckInSection's shape — same direct profile-column toggle,
// same "undefined counts as on" default handling — but with NO feature-flag
// gate: unlike TaskCheckInSection (gated on NEXT_PUBLIC_FEATURE_TASK_OUTCOMES,
// which controls the exact feature it opts out of), the weekly motivational
// sweep (lib/motivation-server.ts) delivers via the pre-existing Web Push
// transport unconditionally, run from the daily due-date cron — it has
// no client flag of its own. ("already-live hourly cron" until 2026-08-12:
// that cron was neither live nor hourly, see CLAUDE.md → Deployment.)
// Gating this toggle on
// NEXT_PUBLIC_FEATURE_NATIVE_PUSH hid the only opt-out from every web-only
// user, who would keep receiving nudges with no way to turn them off.
//
// Being unconditional also makes it the row that guarantees the Notifications
// tab is never empty — see NotificationsSettingsSection.
//
// Became a ROW inside NotificationsSettingsSection (2026-08-13).

export function MotivationalNudgesSection() {
  const user = useAuthStore((state) => state.user);
  const updateMotivationalNudges = useAuthStore((state) => state.updateMotivationalNudges);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  // Undefined on profiles that predate the column, which counts as on.
  const isEnabled = user?.motivational_nudges !== false;

  const handleToggle = async () => {
    setIsWorking(true);
    setError('');
    try {
      await updateMotivationalNudges(!isEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this setting.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <SettingRow
      icon={
        <Sparkles
          className={`h-4 w-4 ${isEnabled ? 'text-brand' : 'text-content-tertiary'}`}
          aria-hidden="true"
        />
      }
      title="Motivation"
      description={
        isEnabled
          ? 'A weekly nudge to keep your releases moving — one push, once a week.'
          : 'Urganize will not send motivational nudges.'
      }
      action={
        <button
          type="button"
          onClick={() => void handleToggle()}
          disabled={isWorking}
          className={settingRowButtonClass(isEnabled)}
        >
          {isWorking ? 'Working…' : isEnabled ? 'Turn off' : 'Turn on'}
        </button>
      }
      error={error}
    />
  );
}
