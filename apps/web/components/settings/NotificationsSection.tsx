'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { panelClass } from './panelClass';

/**
 * These preferences persist to localStorage only -- nothing currently reads
 * that key (no email provider is wired up yet; see CLAUDE.md's External
 * services section). The caption below says so explicitly rather than
 * implying delivery is live, matching architectural principle 8 ("visible
 * state changes... no silent operations") and the same tone already used at
 * components/releases/AssetSection.tsx for a comparable limitation.
 */
export function NotificationsSection() {
  const userId = useAuthStore((state) => state.user?.id || '');

  const [notificationsEmail, setNotificationsEmail] = useState(true);
  const [notificationsProduct, setNotificationsProduct] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!userId) return;
    const raw = localStorage.getItem(`urganize.notifications.${userId}`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      setNotificationsEmail(parsed.notificationsEmail ?? true);
      setNotificationsProduct(parsed.notificationsProduct ?? false);
    } catch {
      setNotificationsEmail(true);
      setNotificationsProduct(false);
    }
  }, [userId]);

  if (!userId) return null;

  const handleSave = () => {
    setIsSaving(true);
    try {
      localStorage.setItem(
        `urganize.notifications.${userId}`,
        JSON.stringify({ notificationsEmail, notificationsProduct })
      );
      setSuccess('Preferences saved');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={`${panelClass} mt-6`}>
      <h2 className="mb-4 text-xl">Notifications</h2>
      <p className="mb-4 text-sm text-content-secondary">
        Saved to this device for now — email delivery isn&apos;t wired up yet, so
        these preferences don&apos;t control anything sent to you.
      </p>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-4 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2">
            <span className="text-sm text-content-primary">Release reminders by email</span>
            <input
              type="checkbox"
              checked={notificationsEmail}
              onChange={(event) => setNotificationsEmail(event.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2">
            <span className="text-sm text-content-primary">Product updates and launch notes</span>
            <input
              type="checkbox"
              checked={notificationsProduct}
              onChange={(event) => setNotificationsProduct(event.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </div>
        {success && <p className="text-sm text-brand">{success}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save notifications'}
        </button>
      </div>
    </section>
  );
}
