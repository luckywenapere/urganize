'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AppLockStatus } from '@urganize/native-bridge';
import { Lock } from '@/components/icons';

import { describeAppLock } from '@/lib/app-lock';
import { request, shellSupports } from '@/lib/native-bridge';
import { SettingRow, settingRowButtonClass } from './SettingRow';

const subscribe = () => () => {};
const lockAvailable = () => shellSupports('lock.status') && shellSupports('lock.set');

/**
 * Face ID / fingerprint / passcode lock for the phone app. Shown only inside
 * the app (a browser tab has nothing to lock), and only once the app has said
 * what the phone can do, so the row never promises a lock that cannot work.
 * The lock itself is the app's: this row asks it for its state and flips it.
 */
export function AppLockSection() {
  const available = useSyncExternalStore(subscribe, lockAvailable, () => false);
  const [status, setStatus] = useState<AppLockStatus | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void request('lock.status', {})
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        // Not worth an error box: the row simply does not appear.
      });
    return () => {
      cancelled = true;
    };
  }, [available]);

  if (!available || !status) return null;

  const copy = describeAppLock(status);

  const handleToggle = async () => {
    setIsWorking(true);
    setError('');
    try {
      setStatus(await request('lock.set', { enabled: !status.enabled }, { timeoutMs: 120_000 }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the app lock.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="py-6 first:pt-0 last:pb-0">
      <SettingRow
        icon={
          <Lock
            className={`h-4 w-4 ${status.enabled ? 'text-brand' : 'text-content-tertiary'}`}
            aria-hidden="true"
          />
        }
        title={copy.title}
        description={copy.description}
        action={
          copy.action ? (
            <button
              type="button"
              onClick={() => void handleToggle()}
              disabled={isWorking}
              className={settingRowButtonClass(status.enabled)}
            >
              {isWorking ? 'Working…' : copy.action}
            </button>
          ) : undefined
        }
        error={error}
      />
    </div>
  );
}
