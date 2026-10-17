import type { HomePlacements, HomeWaiting, HomeYourTasks } from './types';

/**
 * The "For you today" cards at the top of Home (design overhaul, 2026-10-04): the
 * few things that need a manager's eyes, most urgent first, each with one place
 * to go. Pure, so the ranking and the wording can be tested; the component only
 * draws what this returns.
 *
 * Task counts (late, due today, waiting on others) are NOT cards: the summary strip
 * under the greeting already says them, and saying them twice made Home read as
 * noisy. These cards are for the things a count cannot say: a playlist that added
 * a song. (The set-too-long and DJ-link cards went with Shows, Oct 17, 2026.) Nothing with a
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
  waiting: Pick<HomeWaiting, 'tasks'>;
  placements: HomePlacements;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

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
