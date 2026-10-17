import type { HomeReleaseSummary } from './types';

/**
 * What Home offers when the manager has no tasks to do. An empty page is a dead
 * end, so it hands over the next move instead: the rollout that comes out
 * soonest, else a prompt to plan one. Pure, so the order can be tested.
 */
export type UpNext = {
  kind: 'release' | 'start';
  eyebrow: string;
  title: string;
  detail: string;
  href: string;
  action: string;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function pickUpNext(
  releases: readonly Pick<HomeReleaseSummary, 'id' | 'title' | 'artistName' | 'daysOut'>[]
): UpNext {
  const coming = releases
    .filter((release) => release.daysOut !== null && release.daysOut >= 0)
    .sort((a, b) => (a.daysOut as number) - (b.daysOut as number))[0];
  if (coming) {
    const days = coming.daysOut as number;
    return {
      kind: 'release',
      eyebrow: 'Up next',
      title: coming.title,
      detail:
        days === 0
          ? `${coming.artistName || 'Your artist'} · out today`
          : `${coming.artistName || 'Your artist'} · out in ${plural(days, 'day', 'days')}`,
      href: `/dashboard?release=${coming.id}`,
      action: 'Open the rollout',
    };
  }

  return {
    kind: 'start',
    eyebrow: 'Up next',
    title: 'Plan your next rollout',
    detail: 'Pick a format and Urganize builds the plan.',
    href: '/dashboard',
    action: 'Start a rollout',
  };
}
