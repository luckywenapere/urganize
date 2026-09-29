import Link from 'next/link';
import { HomeHeaderRow } from './HomeHeaderRow';
import { EmptyState } from '@/components/shared/EmptyState';
import type { HomePayload } from '@/lib/home/types';

const STATE_LABEL: Record<HomePayload['state'], string> = {
  manager_new: 'a manager just getting started',
  manager_mid_release: 'a manager mid-release',
  manager_between: 'a manager between releases',
  manager_all_clear: 'a manager with nothing outstanding',
  artist_new: 'an artist just getting started',
  artist_mid_release: 'an artist mid-release',
  artist_between: 'an artist between releases',
  label_new: 'a label just getting started',
  label_busy: 'a label with something to catch up on',
  label_gap: 'a label with a gap in the roster',
};

/**
 * Every role/state combination except manager_mid_release, in step 2.
 *
 * Home's role and state selection is fully built and correctly resolved for
 * every account (see lib/home/role.ts and lib/home/state.ts) — what is NOT
 * built yet is the screen for anything other than a manager mid-release,
 * which ships in steps 3–5. This is an honest placeholder rather than a
 * half-built screen with invented data, so this step can be reviewed on
 * whatever real account is available without pretending the other states
 * are finished.
 */
export function HomeNotBuiltYet({ home }: { home: HomePayload }) {
  return (
    <div className="space-y-5">
      <HomeHeaderRow header={home.header} />
      <EmptyState
        title="This part of Home isn't built yet."
        description={`Your account resolved to ${STATE_LABEL[home.state]}. Step 2 only builds the manager, mid-release screen. The rest lands in later steps.`}
        action={
          <Link
            href="/dashboard"
            className="motion-focus inline-flex items-center rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:border-stroke-strong"
          >
            Go to your catalog
          </Link>
        }
      />
    </div>
  );
}
