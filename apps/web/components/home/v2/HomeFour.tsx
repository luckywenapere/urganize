'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from '@/components/icons';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import {
  HOME_FOUR_COPY,
  buildOneThing,
  describeDone,
  describeNextUp,
  pickHeaderRelease,
  pickHomeLayout,
} from '@/lib/home/home-four';
import { HOME_OPPORTUNITIES_HREF } from '@/lib/home/opportunities-card';
import { buildWaitingItems } from '@/lib/home/stack-items';
import type { HomePayload } from '@/lib/home/types';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { useHomeFocusData } from '../useHomeFocusData';
import { useHomeNextMoves } from '../useHomeNextMoves';
import { ManagerNewView } from '../ManagerNewView';
import { OpportunitiesCard } from '../OpportunitiesCard';
import { HomeBell } from './HomeBell';
import { OneThing } from './OneThing';
import { WaitingRow } from './WaitingRow';
import { HOME_ROW, HOME_ROW_CHEVRON, HOME_ROW_VALUE, HOME_ROWS } from './HomeRow';
import { ReleaseReviewCard } from '@/components/between-releases/BetweenReleaseCards';
import { StartNextSheet } from '@/components/between-releases/StartNextSheet';

/** Each block fenced: one that throws goes quiet instead of taking Home down. */
function Fenced({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <ErrorBoundary name={`home-block-${name}`} onError={reportBoundaryError}>
      {children}
    </ErrorBoundary>
  );
}

/** One row, only when a grant matched the team (URG-266's suggested items). */
function OpportunityLine({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link
      href={HOME_OPPORTUNITIES_HREF}
      onClick={() =>
        captureAnalyticsEvent({
          name: 'home_opportunity_clicked',
          properties: { target: 'see_all', source: 'suggested', kind: null, position: null, shown: count },
        })
      }
      className={HOME_ROW}
      data-home-block="opportunity-line"
    >
      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-brand" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{HOME_FOUR_COPY.grantsFit(count)}</span>
      <ChevronRight className={HOME_ROW_CHEVRON} aria-hidden="true" />
    </Link>
  );
}

/** "Done   12 of 40  >": the rollout's progress; opens the rollout. Hidden at 0 tasks. */
function DoneRow({ releaseId, progress }: { releaseId: string; progress: { done: number; total: number } }) {
  const done = describeDone(progress);
  if (!done) return null;
  return (
    <Link
      href={`/dashboard?release=${encodeURIComponent(releaseId)}`}
      className={HOME_ROW}
      data-home-block="done"
    >
      <span className="min-w-0 flex-1 truncate">{HOME_FOUR_COPY.done}</span>
      <span className={HOME_ROW_VALUE}>
        {done.done}
        <span className="text-content-primary/55"> {HOME_FOUR_COPY.of(done.total)}</span>
      </span>
      <ChevronRight className={HOME_ROW_CHEVRON} aria-hidden="true" />
    </Link>
  );
}

/** State A: a rollout in flight. */
function ReleaseHome({ home, viewerId }: { home: HomePayload; viewerId: string }) {
  const { live, releases, yourTasks, waitingTasks, placements } = useHomeFocusData(home, viewerId);
  const nextMoves = useHomeNextMoves({ releases, viewerId, placements });
  const release = pickHeaderRelease(releases);
  if (!release) return null;
  const items = buildOneThing({ yourTasks, moves: nextMoves.moves });
  const nextUp = items.length === 0 ? describeNextUp(yourTasks.week) : null;
  const waitingItems = buildWaitingItems(waitingTasks);
  const matched = (home.opportunities ?? []).filter((item) => item.source === 'suggested').length;

  const showDone = describeDone(release.progress) !== null;
  const showWaiting = waitingItems.length > 0 || live.waitingOnTimeCount > 0;
  const showBand = showDone || showWaiting || matched > 0;

  // Golden layout B (2026-10-18, founder approved): greeting, the One Thing
  // as a golden card, its dots, then numbers in rows (Done, Waiting on others,
  // grants). On a short phone the page scrolls above the UrgAns box
  // (.home-main-padding clears it); nothing is pinned.
  return (
    <div className="flex flex-col">
      {/* The rollout header (title, drop date, faces, phase bars) was removed
          2026-10-26 (founder call): people found it confusing. The greeting and
          the bell stay, the same as Home with nothing in flight. */}
      <HomeGreeting home={home} />
      <div className="mt-6">
        <Fenced name="one-thing">
          <OneThing
            items={items}
            nextUp={nextUp}
            onDismissMove={nextMoves.dismiss}
            headerReleaseId={release.id}
          />
        </Fenced>
      </div>
      {showBand ? (
        <div className={`${items.length > 1 ? 'mt-1' : 'mt-4'} ${HOME_ROWS}`} data-home-block="rows">
          {showDone ? (
            <Fenced name="done">
              <DoneRow releaseId={release.id} progress={release.progress} />
            </Fenced>
          ) : null}
          {showWaiting ? (
            <Fenced name="waiting">
              <WaitingRow items={waitingItems} onTimeCount={live.waitingOnTimeCount} />
            </Fenced>
          ) : null}
          {matched > 0 ? (
            <Fenced name="opportunity-line">
              <OpportunityLine count={matched} />
            </Fenced>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Start the next one (URG-280): opens the pre-production sheet (artist and an
 * optional working title), which makes an undated rollout with the eight
 * Pre-production activities and opens it.
 */
function StartNextCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[20px] border border-stroke-default bg-bg-surface p-5" data-home-block="start-next">
      <span className="inline-flex h-6 items-center rounded-full border border-stroke-default px-2.5 text-[11px] font-semibold text-content-secondary">
        Next release
      </span>
      <p className="mt-3 font-display text-[1.4rem] leading-[1.25] text-content-primary">{HOME_FOUR_COPY.startTitle}</p>
      <p className="mt-1.5 text-sm text-content-secondary">{HOME_FOUR_COPY.startLine}</p>
      <button
        type="button"
        onClick={() => {
          captureAnalyticsEvent({ name: 'start_next_opened', properties: { source: 'home' } });
          setOpen(true);
        }}
        className="motion-focus motion-press mt-4 flex h-12 w-full items-center justify-center rounded-full bg-brand text-[15px] font-semibold text-content-inverse hover:bg-brand-hover"
      >
        {HOME_FOUR_COPY.startAction}
      </button>
      {open ? <StartNextSheet defaultArtistId={null} source="home" onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

/** The date, "Good morning, Name." and the phone's bell top right. Both states. */
function HomeGreeting({ home, line }: { home: HomePayload; line?: string }) {
  return (
    <header data-home-block="greeting" className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-content-primary/55">{home.header.dateLabel}</p>
        <h1 className="mt-2 font-display text-[1.875rem] leading-[1.15] text-content-primary">
          {home.header.greeting}, {home.header.firstName}.
        </h1>
        {line ? <p className="mt-1.5 text-[15px] text-content-secondary">{line}</p> : null}
      </div>
      {/* The phone's bell sits top right on Home in every state (2026-10-17). */}
      <div className="-mr-1 shrink-0">
        <HomeBell />
      </div>
    </header>
  );
}

/** State B: nothing in flight. */
function BetweenHome({ home }: { home: HomePayload; onNewRollout: () => void }) {
  return (
    <div className="flex flex-col">
      <HomeGreeting home={home} line={HOME_FOUR_COPY.noRelease} />
      {/* The post-release review (URG-253): renders nothing when no review is open. */}
      <Fenced name="release-review">
        <div className="mt-6 empty:hidden">
          <ReleaseReviewCard />
        </div>
      </Fenced>
      <div className="mt-6">
        <Fenced name="start-next">
          <StartNextCard />
        </Fenced>
      </div>
      <div className="mt-5">
        <Fenced name="opportunities">
          <OpportunitiesCard items={home.opportunities} />
        </Fenced>
      </div>
    </div>
  );
}

/**
 * Home in four blocks, two states (URG-320, founder approved 2026-10-16). The
 * same blocks on a phone and in the left column on a computer; Ask UrgAns is the
 * pinned box on a phone and the conversation beside this column on a computer.
 * Rules in lib/home/home-four.ts.
 */
export function HomeFour({
  home,
  viewerId,
  onNewRollout,
}: {
  home: HomePayload;
  viewerId: string;
  onNewRollout: () => void;
}) {
  const layout = pickHomeLayout(home.state, home.releases.length);
  if (layout === 'new') return <ManagerNewView home={home} onNewRollout={onNewRollout} />;
  if (layout === 'release') return <ReleaseHomeOrBetween home={home} viewerId={viewerId} onNewRollout={onNewRollout} />;
  return <BetweenHome home={home} onNewRollout={onNewRollout} />;
}

/** The artist picked in the top bar can leave no rollout in flight: then it is State B. */
function ReleaseHomeOrBetween({
  home,
  viewerId,
  onNewRollout,
}: {
  home: HomePayload;
  viewerId: string;
  onNewRollout: () => void;
}) {
  const { releases } = useHomeFocusData(home, viewerId);
  if (releases.length === 0) return <BetweenHome home={home} onNewRollout={onNewRollout} />;
  return <ReleaseHome home={home} viewerId={viewerId} />;
}

/** Home's error state: one card, try again or open the catalogue. */
export function HomeLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="mt-4 rounded-[20px] border border-stroke-default bg-bg-surface p-5" role="alert">
      <p className="text-base font-semibold text-content-primary">{HOME_FOUR_COPY.loadFailed}</p>
      <p className="mt-1 text-sm text-content-secondary">{HOME_FOUR_COPY.loadFailedLine}</p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={onRetry}
          className="motion-focus motion-press inline-flex h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
        >
          {HOME_FOUR_COPY.tryAgain}
        </button>
        <Link
          href="/dashboard"
          className="motion-focus inline-flex h-11 items-center rounded-full border border-stroke-default px-5 text-sm font-semibold text-content-primary hover:border-stroke-strong"
        >
          {HOME_FOUR_COPY.openCatalogue}
        </Link>
      </div>
    </section>
  );
}
