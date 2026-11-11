'use client';

import { useState } from 'react';
import { Newspaper } from '@/components/icons';

import { useAuthStore } from '@/lib/auth-store';
import { SettingRow, settingRowButtonClass } from './SettingRow';

// The morning brief's off switch (#1207, Oyin, 11 Nov 2026). The brief is on
// for everyone by default; this row writes profiles.morning_brief on the
// person's own row, the same direct-update shape the old Motivation row used.
// The 8am job (lib/chappi/morning-brief-server.ts) skips anyone who switched
// it off.

export function MorningBriefSection() {
  const user = useAuthStore((state) => state.user);
  const updateMorningBrief = useAuthStore((state) => state.updateMorningBrief);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  // Undefined on profiles that predate the column, which counts as on.
  const isEnabled = user?.morning_brief !== false;

  const handleToggle = async () => {
    setIsWorking(true);
    setError('');
    try {
      await updateMorningBrief(!isEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this setting.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <SettingRow
      icon={
        <Newspaper
          className={`h-4 w-4 ${isEnabled ? 'text-brand' : 'text-content-tertiary'}`}
          aria-hidden="true"
        />
      }
      title="Morning brief"
      description={
        isEnabled
          ? 'Every morning at 8am, a short brief waits in your Assistant chat, with a notification.'
          : 'No morning brief. Turn it on to get one each day at 8am.'
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
