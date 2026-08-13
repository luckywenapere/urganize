'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';

import { useAuthStore } from '@/lib/auth-store';
import { SettingRow, settingRowButtonClass } from './SettingRow';

// Post-completion check-in. Hidden entirely when the feature is off, so the
// toggle can never promise something the app will not do.
//
// Became a ROW inside NotificationsSettingsSection (2026-08-13) — it was its
// own full section for one button.
const TASK_OUTCOMES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TASK_OUTCOMES === 'true';

export function TaskCheckInSection() {
  const user = useAuthStore((state) => state.user);
  const updateAskAfterTasks = useAuthStore((state) => state.updateAskAfterTasks);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  // Undefined on profiles that predate the column, which counts as on.
  const isEnabled = user?.ask_after_tasks !== false;

  if (!TASK_OUTCOMES_ENABLED) return null;

  const handleToggle = async () => {
    setIsWorking(true);
    setError('');
    try {
      await updateAskAfterTasks(!isEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this setting.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <SettingRow
      icon={
        <MessageCircle
          className={`h-4 w-4 ${isEnabled ? 'text-brand' : 'text-content-tertiary'}`}
          aria-hidden="true"
        />
      }
      title="After tasks"
      description={
        isEnabled
          ? 'When you mark a task done, UrgAns asks how it went. One tap to answer, one tap to skip.'
          : 'UrgAns will not ask how tasks went.'
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
