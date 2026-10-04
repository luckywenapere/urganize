import type { HomeNextShow, HomePlacements, HomeWaiting, HomeYourTasks } from './types';

/**
 * The "For you today" cards at the top of Home (design overhaul, 2026-10-04): the
 * few things that need a manager's eyes, most urgent first, each with one place
 * to go. Pure, so the ranking and the wording can be tested; the component only
 * draws what this returns.
 *
 * Nothing with a count of zero is returned, so a quiet day yields an empty list
 * and Home says so instead of showing a row of zeroes.
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

  const late = input.yourTasks.late.length;
  if (late > 0) {
    items.push({
      key: 'late',
      tone: 'urgent',
      count: late,
      title: `${plural(late, 'task is', 'tasks are')} overdue`,
      detail: 'These are yours and past their date.',
      href: '/dashboard',
      action: 'Review',
    });
  }

  const today = input.yourTasks.today.length;
  if (today > 0) {
    items.push({
      key: 'today',
      tone: 'warn',
      count: today,
      title: `${plural(today, 'task is', 'tasks are')} due today`,
      detail: 'Clear these and today is done.',
      href: '/dashboard',
      action: 'Open',
    });
  }

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

  const waiting = input.waiting.tasks.length;
  if (waiting > 0) {
    items.push({
      key: 'waiting',
      tone: 'warn',
      count: waiting,
      title: `${plural(waiting, 'task is', 'tasks are')} late with your team`,
      detail: 'Someone else owns these. A nudge may help.',
      href: '/dashboard',
      action: 'See who',
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
