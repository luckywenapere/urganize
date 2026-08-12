'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

import { useAuthStore } from '@/lib/auth-store';
import { panelClass } from './panelClass';

// Weekly motivational push opt-out (mobile push notifications, 2026-08-10).
// Mirrors TaskCheckInSection's shape — same direct profile-column toggle,
// same "undefined counts as on" default handling — but with NO feature-flag
// gate: unlike TaskCheckInSection (gated on NEXT_PUBLIC_FEATURE_TASK_OUTCOMES,
// which controls the exact feature it opts out of), the weekly motivational
// sweep (lib/motivation-server.ts) delivers via the pre-existing Web Push
// transport unconditionally, run from the already-live hourly cron — it has
// no client flag of its own. Gating this toggle on
// NEXT_PUBLIC_FEATURE_NATIVE_PUSH hid the only opt-out from every web-only
// user, who would keep receiving nudges with no way to turn them off.

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
    <section className={panelClass}>
      <h2 className="mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Motivation
      </h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles
            className={`mt-0.5 h-4 w-4 shrink-0 ${isEnabled ? 'text-brand' : 'text-content-tertiary'}`}
            aria-hidden="true"
          />
          <p className="max-w-[46ch] text-sm text-content-secondary">
            {isEnabled
              ? 'A weekly nudge to keep your releases moving — one push, once a week.'
              : 'Urganize will not send motivational nudges.'}
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
