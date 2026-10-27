'use client';

import { UrgansActivityList } from '@/components/urgans-activity/UrgansActivityList';
import { panelClass } from './panelClass';

/** Settings > UrgAns: every change UrgAns made across the rollouts you can see,
 *  with a filter by person. The same list a rollout shows for itself. */
export function UrgansActivitySection() {
  return (
    <section id="what-urgans-did" className={`${panelClass} scroll-mt-4`}>
      <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        What UrgAns did
      </h2>
      <p className="mb-4 text-sm text-content-secondary">Every change UrgAns made in the last 30 days, and who asked for it.</p>
      <UrgansActivityList showPersonFilter />
    </section>
  );
}
