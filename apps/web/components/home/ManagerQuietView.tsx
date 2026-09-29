'use client';

import Link from 'next/link';
import { Button } from '@urganize/ui';
import { HomeHeaderRow } from './HomeHeaderRow';
import { ChappiSpeaksCard } from './ChappiSpeaksCard';
import { pickChappiSpeaks } from '@/lib/home/chappi-speaks';
import type { HomePayload } from '@/lib/home/types';

const secondaryLinkClass =
  'motion-focus inline-flex items-center rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:border-stroke-strong';

/**
 * A manager with nothing outstanding: either every rollout in flight is done
 * (manager_all_clear) or none is in flight at all (manager_between). Chappi
 * speaks, and the next useful step sits underneath it.
 *
 * Between rollouts the next step is starting one, so that is the primary
 * button. With something still in flight it is just the catalog. The release
 * check Chappi's line makes runs over the rollouts in flight, which is the only
 * set a release "this week or next" can come from.
 */
export function ManagerQuietView({
  home,
  onNewRollout,
}: {
  home: HomePayload;
  onNewRollout: () => void;
}) {
  const line = pickChappiSpeaks({ releases: home.releases });
  const between = home.state === 'manager_between';

  return (
    <div className="space-y-5">
      <HomeHeaderRow header={home.header} />
      <ChappiSpeaksCard line={line} />
      <div className="flex flex-wrap items-center gap-3">
        {between ? <Button onClick={onNewRollout}>Start a new rollout</Button> : null}
        <Link href="/dashboard" className={secondaryLinkClass}>
          Open your catalog
        </Link>
      </div>
    </div>
  );
}
