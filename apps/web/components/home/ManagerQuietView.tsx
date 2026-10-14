'use client';

import Link from 'next/link';
import { Button } from '@urganize/ui';
import { HomeHeaderRow } from './HomeHeaderRow';
import { HomeBlocks } from './HomeBlocks';
import type { HomePayload } from '@/lib/home/types';

const secondaryLinkClass =
  'motion-focus inline-flex items-center rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:border-stroke-strong';

/**
 * A manager with nothing urgent: either every rollout in flight is on track
 * (manager_all_clear) or none is in flight at all (manager_between).
 *
 * The same groups as a busy Home still show when they have something in them
 * (2026-10-07, founder call): the rollouts in flight, tasks due later this week,
 * the next show, UrgAns' line for the day. Under them sits the next useful
 * step. Between rollouts that is starting one, so the "Plan your next rollout"
 * card is left out: the button already says it.
 */
export function ManagerQuietView({
  home,
  viewerId,
  onNewRollout,
}: {
  home: HomePayload;
  viewerId: string;
  onNewRollout: () => void;
}) {
  const between = home.state === 'manager_between';

  return (
    <div className="space-y-6">
      <HomeHeaderRow header={home.header} />
      <HomeBlocks home={home} viewerId={viewerId} hideStartUpNext={between} />
      <div className="flex flex-wrap items-center gap-3">
        {between ? <Button onClick={onNewRollout}>Start a new rollout</Button> : null}
        <Link href="/dashboard" className={secondaryLinkClass}>
          Open your catalog
        </Link>
      </div>
    </div>
  );
}
