'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Button } from '@urganize/ui';
import { X } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { recordHref } from '@/lib/artist-page';
import { startRecord } from '@/lib/next-records-client';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';

/**
 * "Start the next one" (URG-280, mocks approved 2026-10-16): artist, optional
 * working title, one button. Since 2026-11-04 (#1074, mock screen 7) it starts
 * a project, as just an idea or already being made, and opens its page. A
 * project becomes a rollout when you plan it, and its open tasks move into
 * Pre-production then. It no longer makes a dateless rollout.
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
  const [artistId, setArtistId] = useState<string | null>(defaultArtistId);
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<'idea' | 'making'>('idea');
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
    if (!artistId) {
      setError('Add an artist first, then start their next project.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await startRecord(artistId, { status: stage, ...(title.trim() ? { title: title.trim() } : {}) });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    captureAnalyticsEvent({ name: 'project_started', properties: { source, stage } });
    onClose();
    router.push(recordHref(artistId, result.record.id));
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/60 sm:items-center sm:px-4" role="presentation">
      <button type="button" aria-hidden="true" tabIndex={-1} className="absolute inset-0" onClick={() => !busy && onClose()} />
      <DialogPanel
        label="Start the next one"
        onClose={() => !busy && onClose()}
        className="relative w-full rounded-t-[20px] border border-stroke-default bg-bg-surface px-4 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-5 sm:max-w-[440px] sm:rounded-[20px] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl text-content-primary">Start the next one</h2>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="motion-focus -mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-content-tertiary hover:bg-bg-hover hover:text-content-primary disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-sm text-content-tertiary">Start with the idea. Plan the rollout when the music is ready.</p>

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

        <fieldset className="mt-4">
          <legend className="text-[13px] text-content-secondary">Where it is</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ['idea', 'Just an idea'],
              ['making', 'Already making it'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={stage === value}
                onClick={() => setStage(value)}
                className={`motion-focus inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] ${
                  stage === value
                    ? 'border-brand text-brand'
                    : 'border-stroke-default text-content-primary hover:border-stroke-strong'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-status-error">
            {error}
          </p>
        ) : null}

        <Button className="mt-5 w-full" size="lg" isLoading={busy} onClick={() => void start()}>
          Start the project
        </Button>
      </DialogPanel>
    </div>,
    document.body
  );
}
