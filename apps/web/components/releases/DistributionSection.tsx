'use client';

import { useCallback } from 'react';
import { ExternalLink } from '@/components/icons';
import { openExternalUrl } from '@/lib/external-link';
import { DISTRIBUTION_PARTNER } from '@/lib/distribution';
import type { DistributionPayload } from '@/lib/distribution-server';
import type { DistributionIssue } from '@/lib/distribution-rules';
import type { Release } from '@/types/releases';
import { DistributionRejectionList } from './DistributionIssueList';
import { FanPaymentsCard } from './FanPaymentsCard';
import { distributionAuthHeaders, useDistributionStatus } from './useDistributionStatus';

type DistributionSectionProps = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'releaseDate'>;
  /** Open the sheet that edits the rollout's title and release day. Passed only
   *  for the person who may edit them (the owner). */
  onOpenDetails?: () => void;
  /** Open the Change artist dialog. Passed only for who may. */
  onChangeArtist?: () => void;
};

const PRIMARY_BUTTON =
  'motion-focus motion-press inline-flex h-10 items-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60';

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
 * THE ORDER IS GATED BY THE CHECK (2026-10-09). With errors there is no way to
 * order, only the list and a Fix button for each item. With warnings only, the
 * list shows and the button reads "Order anyway", which is the person saying
 * they have seen it. With nothing to say it is the sign-up button it always was.
 * The server re-runs the check on every order, so none of this is trusted: see
 * the distribution route.
 *
 * This is NOT an order form. The partner's API does not exist yet, so the team
 * signs up on the partner's site and pays them there; see lib/distribution.ts.
 * Fetches for itself and is not cached, so coming back after fixing something
 * shows the fix.
 *
 * Below the check sits Fanlly, the fan payments partner (2026-10-11). It is not
 * a distributor and is never gated by the check; see lib/fan-payments.ts.
 */
export function DistributionSection({ release }: DistributionSectionProps) {
  const { data, setData, loadError, reload } = useDistributionStatus(release.id);

  const order = useCallback(
    async (acknowledgeWarnings: boolean) => {
      // Open FIRST, synchronously inside the tap: a browser only allows a new tab
      // from a user gesture, and the call below is a network round trip. The
      // button only exists when the list we loaded had no errors, and the server
      // checks again below, so this is the one place the order can outrun it.
      void openExternalUrl(DISTRIBUTION_PARTNER.signupUrl);
      try {
        const headers = await distributionAuthHeaders();
        if (!headers) return;
        const response = await fetch(`/api/releases/${release.id}/distribution`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ acknowledgeWarnings }),
        });
        if (response.status === 409) {
          // The rollout changed since this page loaded (a teammate edited it, or a
          // date moved). The refusal carries the current list, which is fresher,
          // and the page re-draws from it: the button disappears if there are
          // errors now, or turns into Order anyway if there are only warnings.
          const body = (await response.json().catch(() => ({}))) as {
            errors?: DistributionIssue[];
            warnings?: DistributionIssue[];
          };
          setData((current: DistributionPayload | null) =>
            current
              ? { ...current, errors: body.errors ?? current.errors, warnings: body.warnings ?? current.warnings }
              : current
          );
          return;
        }
        if (response.ok) {
          setData((current: DistributionPayload | null) =>
            current ? { ...current, lastHandoffAt: new Date().toISOString() } : current
          );
        }
      } catch {
        // The partner's page is already open; a lost log row is not the person's
        // problem, and a toast about it would only confuse them.
      }
    },
    [release.id, setData]
  );

  if (loadError && !data) {
    return (
      <div className="mt-8 border border-status-error/30 bg-status-error/5 p-4">
        <p className="text-sm text-content-primary" role="alert">
          We could not load this step.
        </p>
        <p className="mt-1 text-xs text-content-secondary">{loadError}</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="motion-focus mt-3 text-xs font-semibold text-brand hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-8 space-y-4" aria-busy="true">
        <div className="h-28 animate-pulse border border-stroke-default bg-bg-surface" />
        <div className="h-64 animate-pulse border border-stroke-default bg-bg-surface" />
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {data.rejections.length > 0 ? <DistributionRejectionList rejections={data.rejections} /> : null}

      {/* The two partners side by side (founder, 2026-10-14: the store check that
          sat between them "should stop appearing"). A swipe row on a phone, two
          columns from sm up. The check still runs on the server when the team
          signs up, and its result stays on the rollout's status. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0">
      <div className="w-[85%] shrink-0 snap-start sm:w-auto">
      <section className="flex h-full flex-col border border-stroke-default bg-bg-surface p-4">
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
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
          <button type="button" onClick={() => void order(true)} className={PRIMARY_BUTTON}>
            {`Sign up with ${DISTRIBUTION_PARTNER.name}`}
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
        <p className="mt-3 text-xs text-content-tertiary">
          Free ISRC and UPC codes come with their sign-up, so you do not need your own.
        </p>
      </section>
      </div>
      <div className="w-[85%] shrink-0 snap-start sm:w-auto">
      {/* A separate partner, not a distributor: shown whatever the check says. */}
      <FanPaymentsCard />
      </div>
      </div>
    </div>
  );
}
