'use client';

// Founder broadcast dashboard (2026-07-23): compose a push notification and
// send it to every registered device. Reached at /admin/broadcast — no nav
// entry; access is gated server-side by ADMIN_EMAILS (the GET below 401/403s
// for anyone else, and this page bounces them to /dashboard). The UI follows
// the flat Settings voice: mono kickers, hairline rules, rounded-lg controls.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { SignalIcon } from '@/components/app/BrandIcons';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';

type Reach = { configured: boolean; devices: number; users: number };

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export default function BroadcastPageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();

  const [reach, setReach] = useState<Reach | null>(null);
  const [checked, setChecked] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('/dashboard');
  const [confirming, setConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  // Admin gate: the reach GET doubles as the access check — anyone not in
  // ADMIN_EMAILS gets 401/403 and is bounced home.
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
        const response = await fetch('/api/admin/broadcast', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!response.ok) {
          router.replace('/dashboard');
          return;
        }
        const payload = (await response.json().catch(() => null)) as Reach | null;
        if (!cancelled && payload) {
          setReach(payload);
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

  const canSend = title.trim().length > 0 && message.trim().length > 0 && !isSending;

  const handleSend = async () => {
    if (!canSend) return;
    // Two-step confirm: first click arms, second click fires.
    if (!confirming) {
      setConfirming(true);
      setResult('');
      setError('');
      return;
    }
    setIsSending(true);
    setError('');
    setResult('');
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          body: message.trim(),
          url: link.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        sent?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'Broadcast failed.');
      setResult(`Sent to ${payload.sent ?? 0} device${payload.sent === 1 ? '' : 's'}.`);
      setTitle('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Broadcast failed.');
    } finally {
      setIsSending(false);
      setConfirming(false);
    }
  };

  if (authLoading || !user || !checked) {
    return <AdminPageSkeleton titleWidth="w-72" descriptionLines={2} formFields={3} />;
  }

  // The page frame (outer <main>, padding, the AdminNav side menu) moved to
  // app/admin/layout.tsx when the admin hub landed (2026-07-30); this
  // component renders content only. The old "Back" button went with it —
  // the hub menu is the way around.
  return (
    <div className="w-full max-w-[640px]">
        <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
          <SignalIcon className="h-4 w-4" />
          Broadcast
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Message every user</h1>
        <p className="mt-2 text-sm leading-6 text-content-secondary">
          Sends a push notification to every device that has notifications
          turned on — {reach?.devices ?? 0} device{reach?.devices === 1 ? '' : 's'} across{' '}
          {reach?.users ?? 0} user{reach?.users === 1 ? '' : 's'} right now.
          {reach && !reach.configured
            ? ' Web Push is NOT configured on this deployment — sends will fail until VAPID keys are set.'
            : ''}
        </p>

        <div className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              placeholder="New in Urganize"
              className="input rounded-lg border-stroke-default bg-bg-elevated"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={300}
              rows={4}
              placeholder="Invite links, artist-scoped teammates, and a cleaner mobile catalog just shipped."
              className="input rounded-lg border-stroke-default bg-bg-elevated"
            />
            <span className="mt-1 block text-right font-mono text-[10px] text-content-tertiary">
              {message.length}/300
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Opens <span className="font-normal text-content-tertiary">(in-app path)</span>
            </span>
            <input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="/dashboard"
              className="input rounded-lg border-stroke-default bg-bg-elevated"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error">
              {error}
            </p>
          ) : null}
          {result ? (
            <p className="rounded-lg border border-brand/35 bg-brand/10 px-3 py-2 text-sm text-brand">
              {result}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend}
              className={`motion-focus motion-press inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-content-inverse transition-colors disabled:opacity-50 ${
                confirming ? 'bg-status-error hover:opacity-90' : 'bg-brand hover:bg-brand-hover'
              }`}
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {isSending
                ? 'Sending…'
                : confirming
                  ? `Yes — send to ${reach?.devices ?? 0} devices`
                  : 'Send broadcast'}
            </button>
            {confirming && !isSending ? (
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="motion-focus text-sm text-content-secondary hover:text-content-primary"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
    </div>
  );
}
