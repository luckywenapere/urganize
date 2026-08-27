'use client';

// Editable notification presets (mobile push notifications, 2026-08-10):
// release reminders, weekly motivational nudges, and deadline-tier copy.
// Reached at /admin/notifications, gated server-side by ADMIN_EMAILS (the
// GET below 401/403s for anyone else, and this page bounces them to
// /dashboard) — same shape as /admin/broadcast.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, BellRing } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import type { NotificationPresets } from '@/lib/notification-presets';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

function CategoryToggle({ enabled, onChange }: { enabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${
        enabled
          ? 'border border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover'
          : 'bg-brand text-content-inverse hover:bg-brand-hover'
      }`}
    >
      {enabled ? 'On' : 'Off'}
    </button>
  );
}

export default function NotificationsPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [presets, setPresets] = useState<NotificationPresets | null>(null);
  const [checked, setChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testingCategory, setTestingCategory] = useState<string | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const response = await fetch('/api/admin/notification-presets', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        const payload = (await response.json().catch(() => null)) as { presets?: NotificationPresets } | null;
        if (!cancelled && payload?.presets) {
          setPresets(payload.presets);
          setChecked(true);
        }
      } catch {
        if (!cancelled) router.replace('/dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  const handleSave = async () => {
    if (!presets) return;
    setIsSaving(true);
    setError('');
    setResult('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/notification-presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(presets),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        presets?: NotificationPresets;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Could not save presets.');
      if (payload.presets) setPresets(payload.presets);
      setResult('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save presets.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async (category: string) => {
    setTestingCategory(category);
    setError('');
    setResult('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/notification-presets/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category }),
      });
      const payload = (await response.json().catch(() => ({}))) as { sent?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Test send failed.');
      setResult(
        payload.sent && payload.sent > 0
          ? `Test sent to ${payload.sent} of your device${payload.sent === 1 ? '' : 's'}.`
          : 'No registered devices to send to — turn on notifications for your account first.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test send failed.');
    } finally {
      setTestingCategory(null);
    }
  };

  if (authLoading || !user || !checked || !presets) {
    return <AdminPageSkeleton titleWidth="w-72" descriptionLines={1} formFields={6} />;
  }

  return (
    <div className="w-full max-w-[720px]">
      <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        <BellRing className="h-4 w-4" />
        Notifications
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Notification presets</h1>
      <p className="mt-2 text-sm leading-6 text-content-secondary">
        Edit the copy and timing for automatic pushes. Changes apply on the next send — no
        deploy needed.
      </p>

      {error ? (
        <p className="mt-6 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      {result ? (
        <p className="mt-6 rounded-lg border border-brand/35 bg-brand/10 px-3 py-2 text-sm text-brand">
          {result}
        </p>
      ) : null}

      {/* Release reminders */}
      <section className="mt-8 rounded-lg border border-stroke-default bg-bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Release re-engagement reminders</h2>
            <p className="mt-1 text-xs text-content-tertiary">
              Sent after a user creates a release and doesn’t come back.
            </p>
          </div>
          <CategoryToggle
            enabled={presets.releaseReminders.enabled}
            onChange={(next) =>
              setPresets({ ...presets, releaseReminders: { ...presets.releaseReminders, enabled: next } })
            }
          />
        </div>

        <div className="mt-4 space-y-4">
          {presets.releaseReminders.steps.map((step, index) => (
            <div key={step.id} className="rounded-lg border border-stroke-subtle p-4">
              <p className="font-mono text-[10px] uppercase tracking-wide text-content-tertiary">
                {Math.round(step.delayMinutes / 60 / 24)} day{Math.round(step.delayMinutes / 60 / 24) === 1 ? '' : 's'}{' '}
                after creation
              </p>
              <input
                value={step.title}
                onChange={(event) => {
                  const steps = [...presets.releaseReminders.steps];
                  steps[index] = { ...step, title: event.target.value };
                  setPresets({ ...presets, releaseReminders: { ...presets.releaseReminders, steps } });
                }}
                maxLength={80}
                className="input mt-2 rounded-lg border-stroke-default bg-bg-elevated"
              />
              <textarea
                value={step.body}
                onChange={(event) => {
                  const steps = [...presets.releaseReminders.steps];
                  steps[index] = { ...step, body: event.target.value };
                  setPresets({ ...presets, releaseReminders: { ...presets.releaseReminders, steps } });
                }}
                maxLength={300}
                rows={2}
                className="input mt-2 rounded-lg border-stroke-default bg-bg-elevated"
              />
              <p className="mt-1 text-[11px] text-content-tertiary">
                Use <code>{'{releaseTitle}'}</code> to insert the release’s title.
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleTest('releaseReminders')}
          disabled={testingCategory !== null}
          className="motion-focus mt-4 text-sm font-medium text-brand hover:text-brand-hover disabled:opacity-50"
        >
          {testingCategory === 'releaseReminders' ? 'Sending…' : 'Send test to me'}
        </button>
      </section>

      {/* Motivational nudges */}
      <section className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Weekly motivational nudges</h2>
            <p className="mt-1 text-xs text-content-tertiary">
              One push per week, rotating through this pool. Users can opt out in Settings.
            </p>
          </div>
          <CategoryToggle
            enabled={presets.motivational.enabled}
            onChange={(next) => setPresets({ ...presets, motivational: { ...presets.motivational, enabled: next } })}
          />
        </div>

        <div className="mt-4 space-y-4">
          {presets.motivational.pool.map((nudge, index) => (
            <div key={nudge.id} className="rounded-lg border border-stroke-subtle p-4">
              <input
                value={nudge.title}
                onChange={(event) => {
                  const pool = [...presets.motivational.pool];
                  pool[index] = { ...nudge, title: event.target.value };
                  setPresets({ ...presets, motivational: { ...presets.motivational, pool } });
                }}
                maxLength={80}
                className="input rounded-lg border-stroke-default bg-bg-elevated"
              />
              <textarea
                value={nudge.body}
                onChange={(event) => {
                  const pool = [...presets.motivational.pool];
                  pool[index] = { ...nudge, body: event.target.value };
                  setPresets({ ...presets, motivational: { ...presets.motivational, pool } });
                }}
                maxLength={300}
                rows={2}
                className="input mt-2 rounded-lg border-stroke-default bg-bg-elevated"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleTest('motivational')}
          disabled={testingCategory !== null}
          className="motion-focus mt-4 text-sm font-medium text-brand hover:text-brand-hover disabled:opacity-50"
        >
          {testingCategory === 'motivational' ? 'Sending…' : 'Send test to me'}
        </button>
      </section>

      {/* Deadline reminders */}
      <section className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Deadline reminders</h2>
            <p className="mt-1 text-xs text-content-tertiary">
              Sent at 7 days, 3 days, and 1 day before an activity’s due date.
            </p>
          </div>
          <CategoryToggle
            enabled={presets.deadlineReminders.enabled}
            onChange={(next) =>
              setPresets({ ...presets, deadlineReminders: { ...presets.deadlineReminders, enabled: next } })
            }
          />
        </div>

        <div className="mt-4 space-y-4">
          {(['task_due_7d', 'task_due_3d', 'task_due_soon'] as const).map((tier) => {
            const copy = presets.deadlineReminders.copy[tier];
            const label = tier === 'task_due_7d' ? '7 days before' : tier === 'task_due_3d' ? '3 days before' : '1 day before';
            return (
              <div key={tier} className="rounded-lg border border-stroke-subtle p-4">
                <p className="font-mono text-[10px] uppercase tracking-wide text-content-tertiary">{label}</p>
                <input
                  value={copy.title}
                  onChange={(event) =>
                    setPresets({
                      ...presets,
                      deadlineReminders: {
                        ...presets.deadlineReminders,
                        copy: {
                          ...presets.deadlineReminders.copy,
                          [tier]: { ...copy, title: event.target.value },
                        },
                      },
                    })
                  }
                  maxLength={80}
                  className="input mt-2 rounded-lg border-stroke-default bg-bg-elevated"
                />
                <textarea
                  value={copy.body}
                  onChange={(event) =>
                    setPresets({
                      ...presets,
                      deadlineReminders: {
                        ...presets.deadlineReminders,
                        copy: {
                          ...presets.deadlineReminders.copy,
                          [tier]: { ...copy, body: event.target.value },
                        },
                      },
                    })
                  }
                  maxLength={300}
                  rows={2}
                  className="input mt-2 rounded-lg border-stroke-default bg-bg-elevated"
                />
                <p className="mt-1 text-[11px] text-content-tertiary">
                  Use <code>{'{taskTitle}'}</code> to insert the activity’s title.
                </p>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void handleTest('deadlineReminders')}
          disabled={testingCategory !== null}
          className="motion-focus mt-4 text-sm font-medium text-brand hover:text-brand-hover disabled:opacity-50"
        >
          {testingCategory === 'deadlineReminders' ? 'Sending…' : 'Send test to me'}
        </button>
      </section>

      {/* Credit submissions — the only EVENT-DRIVEN category here: the other
          three are scheduled, this one fires the moment a collaborator submits
          the public credits form. Hence one title and body rather than a step
          list or a pool. */}
      <section className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Credit submissions</h2>
            <p className="mt-1 text-xs text-content-tertiary">
              Sent to the release owner the moment a collaborator sends their credits. Turning this
              off stops the push and the email. Corrections never notify.
            </p>
          </div>
          <CategoryToggle
            enabled={presets.creditSubmissions.enabled}
            onChange={(next) =>
              setPresets({
                ...presets,
                creditSubmissions: { ...presets.creditSubmissions, enabled: next },
              })
            }
          />
        </div>

        <div className="mt-4 rounded-lg border border-stroke-subtle p-4">
          <p className="font-mono text-[10px] uppercase tracking-wide text-content-tertiary">
            Push notification
          </p>
          <input
            value={presets.creditSubmissions.copy.title}
            onChange={(event) =>
              setPresets({
                ...presets,
                creditSubmissions: {
                  ...presets.creditSubmissions,
                  copy: { ...presets.creditSubmissions.copy, title: event.target.value },
                },
              })
            }
            maxLength={80}
            className="input mt-2 rounded-lg border-stroke-default bg-bg-elevated"
          />
          <textarea
            value={presets.creditSubmissions.copy.body}
            onChange={(event) =>
              setPresets({
                ...presets,
                creditSubmissions: {
                  ...presets.creditSubmissions,
                  copy: { ...presets.creditSubmissions.copy, body: event.target.value },
                },
              })
            }
            maxLength={300}
            rows={2}
            className="input mt-2 rounded-lg border-stroke-default bg-bg-elevated"
          />
          <p className="mt-1 text-[11px] text-content-tertiary">
            Use <code>{'{collaboratorName}'}</code> for who sent it and{' '}
            <code>{'{releaseTitle}'}</code> for the release.
          </p>
          <p className="mt-2 text-[11px] text-content-tertiary">
            The email that goes out alongside this is not editable here: it lists exactly what the
            collaborator filled in, so it stays useful to forward to a distributor.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleTest('creditSubmissions')}
          disabled={testingCategory !== null}
          className="motion-focus mt-4 text-sm font-medium text-brand hover:text-brand-hover disabled:opacity-50"
        >
          {testingCategory === 'creditSubmissions' ? 'Sending…' : 'Send test to me'}
        </button>
      </section>

      <div className="mt-8">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="motion-focus motion-press inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
