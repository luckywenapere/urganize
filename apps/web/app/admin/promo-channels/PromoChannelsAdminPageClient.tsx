'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { AdminPageSkeleton } from '@/components/loading/AdminPageSkeleton';
import { PROMO_CHANNEL_KIND_LABELS, promoCountryLabel } from '@/lib/promo-channels';
import type { AdminPromoChannel, AdminPromoPayload, PromoReviewDecision } from '@/lib/promo-channels-server';

// /admin/promo-channels: the promo channel directory's review queue (GitHub
// #833). A team member's suggestion is listed only when it is approved here.
// Follows the /admin/featured gate and load pattern (the backing GET's 401/403
// is the real gate).

export default function PromoChannelsAdminPageClient() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.isLoading);

  const [payload, setPayload] = useState<AdminPromoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const call = useCallback(async (init: RequestInit = {}) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;
    return fetch('/api/admin/promo-channels', {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    });
  }, []);

  const load = useCallback(
    async (options: { asGate?: boolean } = {}) => {
      setError(null);
      try {
        const response = await call();
        if (!response || response.status === 401 || response.status === 403) {
          if (options.asGate) router.replace('/dashboard');
          return;
        }
        const body = (await response.json().catch(() => ({}))) as Partial<AdminPromoPayload> & { error?: string };
        if (!response.ok) {
          setError(body.error || 'Could not load promo channels.');
          return;
        }
        setPayload({ ready: body.ready !== false, pending: body.pending || [], listed: body.listed || [] });
      } catch {
        setError('Could not load promo channels.');
      }
    },
    [call, router]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void load({ asGate: true });
  }, [authLoading, user, router, load]);

  async function review(id: string, decision: PromoReviewDecision) {
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      const response = await call({ method: 'PATCH', body: JSON.stringify({ id, decision }) });
      const body = (await response?.json().catch(() => ({}))) as { error?: string };
      if (!response || !response.ok) {
        setError(body?.error || 'Could not save that.');
        return;
      }
      setNotice(decision === 'list' ? 'Listed.' : decision === 'reject' ? 'Rejected.' : 'Taken down.');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || (!payload && !error)) {
    return <AdminPageSkeleton titleWidth="w-48" descriptionLines={1} table={{ columns: 3, rows: 5 }} />;
  }

  return (
    <div>
      <h1 className="mt-2 font-display text-2xl text-content-primary">Promo channels</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
        Radio, blogs, X communities and SoundCloud networks teams can add to a rollout. A suggestion is
        listed only when you approve it.
      </p>

      <div role="status" aria-live="polite">
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-sm text-status-error"
          >
            {error}
          </p>
        ) : null}
        {notice ? <p className="mt-4 text-sm text-content-secondary">{notice}</p> : null}
      </div>

      {payload && !payload.ready ? (
        <p className="mt-6 rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          The promo_channels table is not in the database yet. Apply 20261011190000_promo_channels.sql.
        </p>
      ) : null}

      {payload ? (
        <>
          <section className="mt-8">
            <h2 className="text-base font-semibold text-content-primary">Waiting ({payload.pending.length})</h2>
            {payload.pending.length === 0 ? (
              <p className="mt-3 text-sm text-content-tertiary">Nothing waiting.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {payload.pending.map((channel) => (
                  <ChannelRow key={channel.id} channel={channel}>
                    <button
                      type="button"
                      disabled={busyId === channel.id}
                      onClick={() => void review(channel.id, 'list')}
                      className="motion-focus min-h-11 rounded-lg border border-brand px-4 text-sm font-medium text-content-primary hover:bg-brand/10 disabled:opacity-50"
                    >
                      List it
                    </button>
                    <button
                      type="button"
                      disabled={busyId === channel.id}
                      onClick={() => void review(channel.id, 'reject')}
                      className="motion-focus min-h-11 rounded-lg border border-stroke-control px-4 text-sm text-content-secondary hover:border-status-error hover:text-status-error disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </ChannelRow>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-base font-semibold text-content-primary">Listed ({payload.listed.length})</h2>
            {payload.listed.length === 0 ? (
              <p className="mt-3 text-sm text-content-tertiary">Nothing listed yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {payload.listed.map((channel) => (
                  <ChannelRow key={channel.id} channel={channel}>
                    <button
                      type="button"
                      disabled={busyId === channel.id}
                      onClick={() => void review(channel.id, 'unlist')}
                      className="motion-focus min-h-11 rounded-lg border border-stroke-control px-4 text-sm text-content-secondary hover:border-status-error hover:text-status-error disabled:opacity-50"
                    >
                      Take down
                    </button>
                  </ChannelRow>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function ChannelRow({ channel, children }: { channel: AdminPromoChannel; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-stroke-default px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="font-medium text-content-primary">{channel.name}</p>
        <p className="text-content-secondary">
          {[PROMO_CHANNEL_KIND_LABELS[channel.kind], channel.city || promoCountryLabel(channel.country)].join(' · ')}
          {channel.cost ? ` · ${channel.cost === 'free' ? 'Free' : 'Paid'}` : ''}
        </p>
        {channel.url ? (
          <a href={channel.url} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">
            {channel.url}
          </a>
        ) : null}
        {channel.howToSubmit ? <p className="mt-1 text-content-secondary">{channel.howToSubmit}</p> : null}
        {channel.suggestionNote ? <p className="mt-1 text-content-tertiary">“{channel.suggestionNote}”</p> : null}
        {channel.suggestedByEmail ? (
          <p className="mt-1 text-xs text-content-tertiary">From {channel.suggestedByEmail}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </li>
  );
}
