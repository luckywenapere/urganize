import type { HomeNextShow, HomePlacements, HomeWaiting, HomeYourTasks } from './types';

/**
 * The "For you today" cards at the top of Home (design overhaul, 2026-10-04): the
 * few things that need a manager's eyes, most urgent first, each with one place
 * to go. Pure, so the ranking and the wording can be tested; the component only
 * draws what this returns.
 *
 * Task counts (late, due today, waiting on others) are NOT cards: the summary strip
 * under the greeting already says them, and saying them twice made Home read as
 * noisy. These cards are for the things a count cannot say: a set that runs over,
 * a DJ who has not opened the tracks, a playlist that added a song. Nothing with a
 * count of zero is returned, and an empty list renders no section at all.
 */
export type AttentionTone = 'urgent' | 'warn' | 'good' | 'info';

export type AttentionItem = {
  key: string;
  tone: AttentionTone;
  count: number;
  title: string;
  detail: string;
  href: string;
  action: string;
};

export type AttentionInput = {
  yourTasks: HomeYourTasks;
  waiting: Pick<HomeWaiting, 'tasks' | 'djLinks'>;
  placements: HomePlacements;
  nextShow: HomeNextShow | null;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  const show = input.nextShow;
  if (show?.setlist && show.setlist.fit === 'over') {
    items.push({
      key: 'setlist-over',
      tone: 'urgent',
      count: 1,
      title: `The set for ${show.artistName} is too long`,
      detail: 'It runs past the slot. Trim a song or two.',
      href: `/dashboard/shows/${show.id}`,
      action: 'Fix the set',
    });
  }

  const djLinks = input.waiting.djLinks.length;
  if (djLinks > 0) {
    items.push({
      key: 'dj-links',
      tone: 'warn',
      count: djLinks,
      title: `${plural(djLinks, 'DJ has', 'DJs have')} not opened the tracks`,
      detail: 'The files were sent and nobody has looked yet.',
      href: '/dashboard/shows',
      action: 'See shows',
    });
  }

  const placed = input.placements.placed.length;
  if (placed > 0) {
    items.push({
      key: 'placements',
      tone: 'good',
      count: placed,
      title: `${plural(placed, 'playlist added', 'playlists added')} your song`,
      detail: 'Good news. Tell the artist.',
      href: '/dashboard/pitching',
      action: 'See pitches',
    });
  }

  return items;
}
