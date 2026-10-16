'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Button } from '@urganize/ui';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { PRE_PRODUCTION_PLAN } from '@/lib/pre-production';
import { supabase } from '@/lib/supabase/client';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useReleaseStore } from '@/stores/useReleaseStore';

/**
 * "Start the next one" (URG-280): artist, optional working title, one button.
 * Creates a rollout with no release date and the eight Pre-production
 * activities, then opens it. A bottom sheet on phones, a centred panel on
 * desktop (mocks approved 2026-10-16).
 */
export function StartNextSheet({
  defaultArtistId,
  source = 'review',
  onClose,
}: {
  defaultArtistId: string | null;
  source?: 'review' | 'home';
  onClose: () => void;
}) {
  const router = useRouter();
  const artists = useArtistRosterStore((state) => state.artists);
  const loadArtists = useArtistRosterStore((state) => state.load);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const [artistId, setArtistId] = useState<string | null>(defaultArtistId);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadArtists();
  }, [loadArtists]);
  useEffect(() => {
    if (!artistId && artists.length > 0) setArtistId(artists[0].id);
  }, [artistId, artists]);
  useEffect(() => lockBodyScroll(), []);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch('/api/releases', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: PRE_PRODUCTION_PLAN,
          ...(artistId ? { artistId } : {}),
          ...(title.trim() ? { title: title.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { release?: { id?: string }; id?: string; error?: string };
      const releaseId = payload.release?.id ?? payload.id;
      if (!response.ok || !releaseId) throw new Error(payload.error || 'Could not start it. Try again.');
      captureAnalyticsEvent({ name: 'pre_production_started', properties: { source } });
      await loadCommandCenter({ force: true }).catch(() => null);
      onClose();
      router.push(`/dashboard?release=${releaseId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start it. Try again.');
      setBusy(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/60 sm:items-center sm:px-4" role="presentation">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={() => !busy && onClose()} />
      <DialogPanel
        label="Start the next one"
        onClose={() => !busy && onClose()}
        className="relative w-full rounded-t-[20px] border border-stroke-default bg-bg-surface px-4 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-5 sm:max-w-[440px] sm:rounded-[20px] sm:p-6"
      >
        <h2 className="font-display text-xl text-content-primary">Start the next one</h2>
        <p className="mt-1 text-sm text-content-tertiary">From sessions to the final video. No release date needed.</p>

        {artists.length > 0 ? (
          <fieldset className="mt-4">
            <legend className="text-[13px] text-content-secondary">Artist</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {artists.map((artist) => (
                <button
                  key={artist.id}
                  type="button"
                  aria-pressed={artist.id === artistId}
                  onClick={() => setArtistId(artist.id)}
                  className={`motion-focus inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] ${
                    artist.id === artistId
                      ? 'border-brand text-brand'
                      : 'border-stroke-default text-content-primary hover:border-stroke-strong'
                  }`}
                >
                  {artist.name}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] text-content-secondary">Working title</span>
          <input
            type="text"
            value={title}
            maxLength={140}
            placeholder="Optional"
            onChange={(event) => setTitle(event.target.value)}
            className="motion-focus h-11 w-full rounded-[10px] border border-stroke-control bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-stroke-strong focus:outline-none"
          />
        </label>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <Button className="mt-5 w-full" size="lg" isLoading={busy} onClick={() => void start()}>
          Start pre-production
        </Button>
      </DialogPanel>
    </div>,
    document.body
  );
}
