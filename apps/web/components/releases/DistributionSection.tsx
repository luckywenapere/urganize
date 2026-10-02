'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Info } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { openExternalUrl } from '@/lib/external-link';
import { useSceneOverlay } from '@/components/workspace/useSceneOverlay';
import {
  DISTRIBUTION_PARTNER,
  buildDistributionChecks,
  releaseDateWarning,
  summarizeDistribution,
} from '@/lib/distribution';
import type { DistributionPayload } from '@/lib/distribution-server';
import type { Release } from '@/types/releases';

type DistributionSectionProps = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'releaseDate'>;
};

// Read here, not passed in: they are the same inlined flags the rollout menu
// reads, and a fix link must only appear for a scene that exists.
const FLAGS = {
  metadata: process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true',
  song: process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true',
  coverArt: process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true',
};

const PRIMARY_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover';

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

const formatDay = (iso: string): string => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(ms)
  );
};

/**
 * The Distribute step: is this rollout ready to be delivered to stores, and a
 * way across to the distribution partner.
 *
 * This is NOT an order form. The partner's API does not exist yet, so the team
 * signs up on the partner's site and pays them there; see lib/distribution.ts.
 * Fetches for itself and is not cached, so coming back after fixing something
 * shows the fix.
 */
export function DistributionSection({ release }: DistributionSectionProps) {
  const { openScene } = useSceneOverlay();
  const [data, setData] = useState<DistributionPayload | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const headers = await authHeaders();
      if (!headers) {
        setLoadError('Your session expired. Sign in again.');
        return;
      }
      const response = await fetch(`/api/releases/${release.id}/distribution`, { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoadError(String(body?.error || 'Could not load this step.'));
        return;
      }
      setData(body.distribution as DistributionPayload);
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    }
  }, [release.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => (data ? summarizeDistribution(buildDistributionChecks(data.facts, FLAGS)) : null),
    [data]
  );
  const dateWarning = useMemo(
    // The clock is read when the data arrives, never during render.
    () => (data ? releaseDateWarning(data.facts.releaseDate, new Date()) : null),
    [data]
  );

  const goToPartner = useCallback(async () => {
    // Open FIRST, synchronously inside the tap: a browser only allows a new tab
    // from a user gesture, and the log call below is a network round trip.
    void openExternalUrl(DISTRIBUTION_PARTNER.signupUrl);
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const response = await fetch(`/api/releases/${release.id}/distribution`, {
        method: 'POST',
        headers,
      });
      if (response.ok) {
        setData((current) =>
          current ? { ...current, lastHandoffAt: new Date().toISOString() } : current
        );
      }
    } catch {
      // The partner's page is already open; a lost log row is not the person's
      // problem, and a toast about it would only confuse them.
    }
  }, [release.id]);

  if (loadError && !data) {
    return (
      <div className="mt-8 border border-status-error/30 bg-status-error/5 p-4">
        <p className="text-sm text-content-primary" role="alert">
          We could not load this step.
        </p>
        <p className="mt-1 text-xs text-content-secondary">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="motion-focus mt-3 text-xs font-semibold text-brand hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data || !summary) {
    return (
      <div className="mt-8 space-y-4" aria-busy="true">
        <div className="h-28 animate-pulse border border-stroke-default bg-bg-surface" />
        <div className="h-64 animate-pulse border border-stroke-default bg-bg-surface" />
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="border border-stroke-default bg-bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Default distributor
        </p>
        <h3 className="mt-1 text-base font-semibold text-content-primary">
          {DISTRIBUTION_PARTNER.name}
        </h3>
        <p className="mt-2 text-sm text-content-secondary">
          They put your music on Spotify, Apple Music, YouTube Music, Audiomack, Boomplay and more.
          Sign up with the button below, then finish setting up your account on their site. You pay
          them there, and they pay your royalties. Urganize takes no share of them.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={() => void goToPartner()} className={PRIMARY_BUTTON}>
            Sign up with {DISTRIBUTION_PARTNER.name}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </button>
          <a
            href={DISTRIBUTION_PARTNER.termsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="motion-focus text-xs font-medium text-content-secondary underline underline-offset-4 hover:text-content-primary"
          >
            Their terms
          </a>
        </div>
        {data.lastHandoffAt ? (
          <p className="mt-3 text-xs text-content-tertiary" role="status">
            Someone on your team opened their sign-up on {formatDay(data.lastHandoffAt)}.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="distribution-ready-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h3
            id="distribution-ready-heading"
            className="text-sm font-semibold text-content-primary"
          >
            Is this rollout ready?
          </h3>
          <span className="font-mono text-xs text-content-tertiary">
            {summary.requiredDone}/{summary.requiredTotal}
          </span>
        </div>
        <p
          className={`mt-1 text-sm ${summary.ready ? 'text-brand' : 'text-content-secondary'}`}
        >
          {summary.ready
            ? 'Everything the stores ask for is here.'
            : 'Have these ready when you set up your account, so nothing holds up delivery.'}
        </p>

        <ul className="mt-4 divide-y divide-stroke-subtle border border-stroke-default bg-bg-surface">
          {summary.checks.map((check) => (
            <li key={check.key} className="flex items-start gap-3 px-4 py-3">
              {check.done ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              ) : (
                <span
                  className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full border border-stroke-control"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content-primary">
                  {check.label}
                  {!check.required ? (
                    <span className="ml-2 text-xs font-normal text-content-tertiary">
                      Also worth doing
                    </span>
                  ) : null}
                  <span className="sr-only">{check.done ? ', done' : ', not done'}</span>
                </p>
                {!check.done ? (
                  <p className="mt-0.5 text-xs text-content-secondary">{check.hint}</p>
                ) : null}
              </div>
              {!check.done && check.fixIn ? (
                <button
                  type="button"
                  onClick={() => {
                    if (check.fixIn) openScene(check.fixIn, release.id);
                  }}
                  className="motion-focus shrink-0 text-xs font-semibold text-brand hover:underline"
                >
                  Fix this
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {dateWarning ? (
          <p className="mt-3 flex items-start gap-2 text-xs text-status-warning" role="status">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {dateWarning}
          </p>
        ) : null}

        <p className="mt-3 text-xs text-content-tertiary">
          Free ISRC and UPC codes come with their sign-up, so you do not need your own.
        </p>
      </section>
    </div>
  );
}
