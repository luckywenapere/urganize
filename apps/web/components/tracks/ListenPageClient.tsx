/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { AudioPlayer, Logo } from '@urganize/ui';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { type ListenPageData, type ListenPageResponse, type TrackApiError } from '@/lib/tracks';

type ListenPageClientProps = {
  token: string;
};

export function ListenPageClient({ token }: ListenPageClientProps) {
  const [data, setData] = useState<ListenPageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/listen/${token}`, {
          method: 'GET',
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as Partial<
          ListenPageResponse & TrackApiError
        >;

        if (!response.ok || !payload.data) {
          throw new Error(payload.error || 'This link is no longer available.');
        }

        if (!isCancelled) {
          setData(payload.data);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : 'This link is no longer available.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto flex min-h-screen max-w-[1120px] flex-col justify-between px-6 py-8">
          <div className="flex justify-start opacity-70">
            <Logo size="lg" priority className="justify-start" />
          </div>

          <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-center">
            <div className="aspect-square rounded-[36px] border border-stroke-default bg-bg-surface/70 skeleton-shimmer" />
            <div className="space-y-4">
              <div className="h-4 w-28 rounded-full skeleton-shimmer" />
              <div className="h-14 w-3/4 rounded-[18px] skeleton-shimmer" />
              <div className="h-5 w-1/2 rounded-full skeleton-shimmer" />
              <div className="h-[220px] rounded-[30px] border border-stroke-default bg-bg-surface/70 skeleton-shimmer" />
            </div>
          </div>

          <p className="text-sm text-content-tertiary">Powered by Urganize</p>
        </div>
      </main>
    );
  }

  if (!data || error) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto flex min-h-screen max-w-[960px] flex-col items-center justify-center px-6 py-10 text-center">
          <div className="opacity-70">
            <Logo size="lg" priority />
          </div>

          <div className="modal-shell mt-10 px-6 py-10 sm:px-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/50">
              Private listen
            </p>
            <h1 className="mt-4 text-4xl tracking-tight sm:text-5xl">
              Link unavailable
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/60 sm:text-base">
              It may have expired or been removed.
            </p>
          </div>

          <p className="mt-8 text-sm text-content-tertiary">Powered by Urganize</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base text-white">
      {data.track.artworkUrl ? (
        <>
          <div className="absolute inset-0">
            <img
              src={data.track.artworkUrl}
              alt=""
              className="h-full w-full object-cover opacity-18 blur-[80px]"
            />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.16),transparent_36%),linear-gradient(180deg,rgba(5,5,5,0.24),rgba(5,5,5,0.92)_58%,#050505)]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.08),transparent_26%),linear-gradient(180deg,#080808,#050505_65%)]" />
      )}

      <div className="relative mx-auto flex min-h-screen max-w-[1160px] flex-col justify-between px-6 py-8">
        <header className="flex items-center justify-between gap-4">
          <div className="opacity-75">
            <Logo size="lg" priority className="justify-start" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
            Private listen
          </p>
        </header>

        <section className="grid gap-8 pb-10 pt-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-center lg:gap-12">
          <div className="relative">
            <div className="absolute inset-0 rounded-[38px] bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.24),transparent_54%)] blur-2xl" />
            <div className="relative aspect-square overflow-hidden rounded-[38px] border border-white/10 bg-white/[0.04] shadow-[0_40px_120px_-60px_rgba(0,0,0,0.9)]">
              {data.track.artworkUrl ? (
                <img
                  src={data.track.artworkUrl}
                  alt={`${data.track.title} artwork`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.18),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]">
                  <div className="text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/38">
                      Urganize
                    </p>
                    <p className="mt-4 text-6xl">♪</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
              Private listen
            </p>
            <h1 className="mt-4 text-[clamp(2.6rem,6vw,5rem)] leading-[0.94] tracking-[-0.04em]">
              {data.track.title}
            </h1>
            <p className="mt-4 text-lg text-white/68">
              {data.track.artistName}
              {data.track.releaseTitle ? (
                <span className="text-white/34"> • {data.track.releaseTitle}</span>
              ) : null}
            </p>

            {data.shareLink.label ? (
              <div className="mt-5 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.16em] text-white/55">
                {data.shareLink.label}
              </div>
            ) : null}

            <div className="mt-8">
              <AudioPlayer
                src={data.track.audioUrl}
                title={data.track.title}
                waveformData={data.track.waveformData}
                durationSeconds={data.track.durationSeconds}
                className="border-white/10 bg-white/[0.04]"
                onPlay={(currentTime) =>
                  captureAnalyticsEvent({
                    name: 'track_played',
                    properties: {
                      token,
                      seconds_into_track: Math.round(currentTime),
                    },
                  })
                }
              />
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-6 text-sm text-white/38">
          <span>Powered by Urganize</span>
          <span>Private link. No login needed.</span>
        </footer>
      </div>
    </main>
  );
}
