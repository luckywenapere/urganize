'use client';

import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { errorMessage } from '@/lib/errors';
import {
  disablePush,
  enablePush,
  getPushStatus,
  isPushSupported,
  type PushStatus,
} from '@/lib/push';
import { panelClass } from './panelClass';

// Real push notifications (2026-07-23) — replaces the placebo prefs section
// removed earlier the same day. Per-device: enabling here registers THIS
// browser/PWA for pushes (task assigned to you, task due, status changes).

const STATUS_COPY: Record<PushStatus, string> = {
  unsupported: 'This browser does not support push notifications.',
  blocked:
    'Notifications are blocked for this site at the browser level. Allow them in your browser settings, then try again.',
  // Enabled state carries no description (founder call, 2026-07-23) — the
  // lit icon + the "Turn off" button say everything.
  enabled: '',
  disabled: 'Turn on notifications to hear about activity assignments, due dates, and status changes on this device.',
};

export function PushNotificationsSection() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getPushStatus().then((resolved) => {
      if (!cancelled) setStatus(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hidden entirely (not disabled) when the browser can't do push at all —
  // an inert section would just be noise. Renders nothing until the status
  // probe resolves so there's no flash of the wrong state.
  if (status === null || !isPushSupported()) return null;

  const handleToggle = async () => {
    setError('');
    setIsWorking(true);
    try {
      const next = status === 'enabled' ? await disablePush() : await enablePush();
      setStatus(next);
    } catch (err) {
      setError(errorMessage(err, 'Could not update notifications.'));
      setStatus(await getPushStatus());
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <section className={panelClass}>
      <h2 className="mb-5 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Notifications
        {/* Notifications are Beta (founder call, 2026-07-23) — standard pill. */}
        <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
          Beta
        </span>
      </h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <BellRing
            className={`mt-0.5 h-4 w-4 shrink-0 ${status === 'enabled' ? 'text-brand' : 'text-content-tertiary'}`}
            aria-hidden="true"
          />
          {STATUS_COPY[status] ? (
            <p className="max-w-[46ch] text-sm text-content-secondary">{STATUS_COPY[status]}</p>
          ) : (
            <p className="text-sm text-content-secondary">On for this device.</p>
          )}
        </div>
        {status !== 'blocked' ? (
          <button
            type="button"
            onClick={() => void handleToggle()}
            disabled={isWorking}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
              status === 'enabled'
                ? 'border border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover'
                : 'bg-brand text-content-inverse hover:bg-brand-hover'
            }`}
          >
            {isWorking
              ? 'Working…'
              : status === 'enabled'
                ? 'Turn off on this device'
                : 'Turn on notifications'}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-status-error">{error}</p> : null}
    </section>
  );
}
