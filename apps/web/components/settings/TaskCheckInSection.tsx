'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';

import { useAuthStore } from '@/lib/auth-store';
import { panelClass } from './panelClass';

// Post-completion check-in. Hidden entirely when the feature is off, so the
// toggle can never promise something the app will not do.
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
    <section className={panelClass}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        After tasks
      </h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <MessageCircle
            className={`mt-0.5 h-4 w-4 shrink-0 ${isEnabled ? 'text-brand' : 'text-content-tertiary'}`}
            aria-hidden="true"
          />
          <p className="max-w-[46ch] text-sm text-content-secondary">
            {isEnabled
              ? 'When you mark a task done, UrgAns asks how it went. One tap to answer, one tap to skip.'
              : 'UrgAns will not ask how tasks went.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleToggle()}
          disabled={isWorking}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
            isEnabled
              ? 'border border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover'
              : 'bg-brand text-content-inverse hover:bg-brand-hover'
          }`}
        >
          {isWorking ? 'Working…' : isEnabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-status-error">{error}</p> : null}
    </section>
  );
}
