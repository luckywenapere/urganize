/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Logo } from '@urganize/ui';
import {
  STREAMING_PLATFORMS,
  formatReleaseDate,
  type PreSaveApiError,
  type PreSaveStreamingLinks,
  type PublicPreSaveCampaign,
  type PublicPreSaveCampaignResponse,
  type SubscribePreSaveResponse,
} from '@/lib/pre-save';
import { PublicPreSaveSkeleton } from '@/components/pre-save/PublicPreSaveSkeleton';
import { PreSaveCountdown } from '@/components/pre-save/PreSaveCountdown';

type PublicPreSavePageProps = {
  slug: string;
};

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

function getCoverFallbackMonogram(artistName: string, releaseTitle: string): string {
  const source = `${artistName} ${releaseTitle}`.trim();
  const letters = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() || '')
    .join('');

  return letters || 'U';
}

function PlatformLinks({ links }: { links: PreSaveStreamingLinks }) {
  const availablePlatforms = useMemo(
    () => STREAMING_PLATFORMS.filter((platform) => Boolean(links[platform.key])),
    [links]
  );

  if (availablePlatforms.length === 0) {
    return (
      <div className="rounded-[24px] border border-white/10 bg-black/28 px-4 py-5 text-sm text-white/72">
        You&apos;re in. We&apos;ll email you when it goes live.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {availablePlatforms.map((platform) => (
        <a
          key={platform.key}
          href={links[platform.key]}
          target="_blank"
          rel="noreferrer"
          className="group rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-4 transition hover:-translate-y-[1px] hover:border-emerald-300/35 hover:bg-emerald-300/[0.08]"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Listen on</p>
              <p className="mt-2 text-base font-semibold text-white">{platform.label}</p>
            </div>
            <span className="rounded-full border border-white/10 p-2 text-white/68 transition group-hover:border-emerald-300/35 group-hover:text-emerald-200">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M7 17 17 7" strokeLinecap="round" />
                <path d="M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}

export function PublicPreSavePage({ slug }: PublicPreSavePageProps) {
  const [campaign, setCampaign] = useState<PublicPreSaveCampaign | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [revealedLinks, setRevealedLinks] = useState<PreSaveStreamingLinks>({});

  useEffect(() => {
    let isActive = true;

    const loadCampaign = async () => {
      setLoadState('loading');
      setLoadError('');

      try {
        const response = await fetch(`/api/pre-save/${encodeURIComponent(slug)}`, {
          method: 'GET',
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as Partial<
          PublicPreSaveCampaignResponse & PreSaveApiError
        >;

        if (!response.ok) {
          if (response.status === 404) {
            if (isActive) {
              setLoadState('not-found');
            }
            return;
          }

          throw new Error(payload.error || 'Could not load this pre-save page.');
        }

        if (isActive) {
          setCampaign(payload.campaign || null);
          setLoadState(payload.campaign ? 'ready' : 'not-found');
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : 'Could not load this pre-save page.');
        setLoadState('error');
      }
    };

    void loadCampaign();

    return () => {
      isActive = false;
    };
  }, [slug]);

  const handleSubscribe = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaign || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch(`/api/pre-save/${encodeURIComponent(campaign.slug)}/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        SubscribePreSaveResponse & PreSaveApiError
      >;

      if (!response.ok) {
        throw new Error(payload.error || 'Could not save your email.');
      }

      setRevealedLinks(payload.streamingLinks || campaign.streamingLinks);
      setIsSubmitted(true);
      setEmail('');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not save your email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadState === 'loading') {
    return <PublicPreSaveSkeleton />;
  }

  if (!campaign || loadState === 'not-found' || loadState === 'error') {
    return (
      <main className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">
        <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.16),transparent_62%)]" />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[960px] flex-col px-4 pb-10 pt-6 sm:px-6">
          <header className="flex items-center justify-between">
            <Logo size="sm" priority className="opacity-75" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/34">Powered by Urganize</p>
          </header>

          <div className="my-auto rounded-[36px] border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_42px_100px_-54px_rgba(0,0,0,0.82)] backdrop-blur-xl sm:p-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42">
              {loadState === 'not-found' ? 'Link unavailable' : 'Page unavailable'}
            </p>
            <h1 className="mt-5 text-4xl text-white sm:text-5xl">
              {loadState === 'not-found' ? 'This pre-save link is no longer live.' : 'This page could not load.'}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-white/64 sm:text-base">
              {loadError || 'This campaign may have been removed or is still being set up.'}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const coverFallbackMonogram = getCoverFallbackMonogram(campaign.artistName, campaign.releaseTitle);
  const releaseSummary = campaign.releaseDate ? formatReleaseDate(campaign.releaseDate) : 'Date to be announced';

  return (
      <main className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.14),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.06),transparent_22%),linear-gradient(180deg,#050505_0%,#090909_48%,#040404_100%)]" />
      <div className="absolute left-[-10rem] top-16 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(62,207,142,0.18),transparent_66%)] blur-3xl" />
      <div className="absolute bottom-[-10rem] right-[-6rem] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(62,207,142,0.12),transparent_64%)] blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1280px] flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Logo size="sm" priority className="opacity-70" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/30">Powered by Urganize</p>
        </header>

        <div className="mt-8 grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:items-center">
          <section className="relative">
            <div className="rounded-[34px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_40px_120px_-58px_rgba(0,0,0,0.92)]">
              <div className="relative aspect-square overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
                {campaign.coverArtUrl ? (
                  <>
                    <img
                      src={campaign.coverArtUrl}
                      alt={`${campaign.releaseTitle} cover art`}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_12%,rgba(0,0,0,0.12)_45%,rgba(0,0,0,0.7)_100%)]" />
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.28),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01))]">
                    <span className="text-7xl font-semibold tracking-[-0.08em] text-white/88 sm:text-8xl">
                      {coverFallbackMonogram}
                    </span>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
                  <div className="max-w-[26rem] rounded-[24px] border border-white/12 bg-black/32 px-4 py-4 backdrop-blur-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Upcoming release</p>
                    <h1 className="mt-3 text-4xl text-white sm:text-5xl">{campaign.releaseTitle}</h1>
                    <p className="mt-3 text-base text-white/74 sm:text-lg">{campaign.artistName}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col justify-center">
            <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_38px_100px_-56px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/42">Pre-save</p>
              <h2 className="mt-5 text-4xl text-white sm:text-[3.35rem]">
                Be first on release day
              </h2>
              <p className="mt-5 text-sm leading-7 text-white/66 sm:text-base">
                Enter your email to get the release link for <span className="text-white">{campaign.releaseTitle}</span> by{' '}
                <span className="text-white">{campaign.artistName}</span>.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-black/25 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/56">
                  {releaseSummary}
                </div>
              </div>

              {campaign.releaseDate ? (
                <div className="mt-6">
                  <PreSaveCountdown releaseDate={campaign.releaseDate} />
                </div>
              ) : null}

              <div className="mt-7 rounded-[30px] border border-white/10 bg-black/28 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                {!isSubmitted ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-white">Join the list</p>
                        <p className="mt-2 text-sm text-white/62">
                          Enter your email for the link.
                        </p>
                      </div>
                    </div>

                    <form className="mt-5 space-y-3" onSubmit={(event) => void handleSubscribe(event)}>
                      <label className="block">
                        <span className="sr-only">Email address</span>
                        <input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          required
                          autoComplete="email"
                          placeholder="Email address"
                          className="h-14 w-full rounded-full border border-white/10 bg-white/[0.04] px-5 text-base text-white outline-none transition placeholder:text-white/30 focus:border-emerald-300/45 focus:bg-white/[0.06]"
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex h-14 w-full items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold uppercase tracking-[0.16em] text-content-inverse shadow-[0_24px_50px_-30px_rgba(62,207,142,0.75)] transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-65"
                      >
                        {isSubmitting ? 'Saving...' : 'Get notified'}
                      </button>
                    </form>

                    {submitError ? (
                      <p className="mt-4 rounded-[20px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                        {submitError}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div aria-live="polite">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand-muted animate-pulse-glow">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-content-inverse animate-scale-in">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m5.5 12.5 4.1 4.1L18.5 7.7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-white">You&apos;re in.</p>
                        <p className="mt-2 text-sm text-white/66">
                          We&apos;ll email you when it drops. If links are live, they&apos;re below.
                        </p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <PlatformLinks links={revealedLinks} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-8 flex items-center justify-between gap-4 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/24">
          <Logo size="sm" className="opacity-30" />
          <span>Powered by Urganize</span>
        </footer>
      </div>
    </main>
  );
}
