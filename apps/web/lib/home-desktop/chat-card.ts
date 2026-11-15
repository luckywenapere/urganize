// The chat card at the top of Home on a computer (#1295, part of #1175;
// founder approved docs/mocks/home-chat-desktop): a greeting, a box to ask AI,
// an "About" picker and up to four suggestions written from the person's own
// data, beside the Next drop. The pure half, so it is tested.

import { greetingForHour } from '../home/header';
import type { ArtistStatus } from '../artists-list';

export const CHAT_CARD_COPY = {
  ask: 'What is on your mind?',
  placeholder: 'What is slipping? Who is waiting on you? What comes next? Just ask.',
  everything: 'Everything',
  everythingDetail: 'All artists and rollouts',
  enterHint: 'Enter to send',
  noDropTitle: 'Nothing is dated yet',
  noDropLine: 'Give a rollout a release day and its countdown shows here.',
} as const;

const DAY_MS = 86_400_000;

const PART_OF_DAY: Record<string, string> = {
  'Good morning': 'morning',
  'Good afternoon': 'afternoon',
  'Good evening': 'evening',
};

/**
 * "Sunday evening" over "Good evening, Oyin." The hours are the phone Home's
 * (greetingForHour), read from the device clock. With no name the greeting
 * just ends, rather than "Good evening, there."
 */
export function chatCardGreeting({ name, now = new Date() }: { name: string | null | undefined; now?: Date }): {
  line: string;
  greeting: string;
} {
  const greeting = greetingForHour(now.getHours());
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(now);
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return {
    line: `${weekday} ${PART_OF_DAY[greeting]}`,
    greeting: first ? `${greeting}, ${first}.` : `${greeting}.`,
  };
}

const dayNumber = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.round(parsed / DAY_MS) : null;
};

export type AboutOption = { id: string; title: string; detail: string; days: number | null };

type AboutSource = { id: string; title: string; artistName?: string | null; releaseDate?: string | null };

/**
 * The rollouts under "About", Everything aside: the nearest drop first, then
 * rollouts with no date yet, then the ones already out, newest first. `today`
 * is a YYYY-MM-DD day (Lagos on the page). Ties keep the order given.
 */
export function aboutOptions(releases: readonly AboutSource[], today: string): AboutOption[] {
  const todayN = dayNumber(today) ?? 0;
  const ranked = releases.map((release, index) => {
    const date = dayNumber(release.releaseDate);
    const days = date === null ? null : date - todayN;
    const rank = days === null ? 1 : days >= 0 ? 0 : 2;
    return { release, index, days, rank };
  });
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank === 0 && a.days !== b.days) return (a.days ?? 0) - (b.days ?? 0);
    if (a.rank === 2 && a.days !== b.days) return (b.days ?? 0) - (a.days ?? 0);
    return a.index - b.index;
  });
  return ranked.map(({ release, days }) => {
    const when =
      days === null ? 'no date yet' : days < 0 ? 'out' : days === 0 ? 'drops today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    const artist = (release.artistName ?? '').trim();
    return { id: release.id, title: release.title, detail: artist ? `${artist} · ${when}` : when, days };
  });
}

/** Everything (null), unless there is just one rollout: then that one. */
export function defaultAboutId(options: readonly { id: string }[]): string | null {
  return options.length === 1 ? options[0].id : null;
}

export type SuggestionKind = 'late' | 'today' | 'plan' | 'write';

export type ChatSuggestion = {
  kind: SuggestionKind;
  text: string;
  /** The rollout the suggestion is about: it goes to that rollout's chat. */
  releaseId: string | null;
};

/** One artist's line on Home, as lib/artists-list.ts works it out. */
export type SuggestionRow = {
  artistName: string;
  status: ArtistStatus;
  releaseId: string | null;
  title: string | null;
  daysToGo: number | null;
  late: number;
};

/**
 * Up to four suggestions, each hidden when its data is missing:
 *  - late: the rollout in flight with the most late tasks;
 *  - today: anything in flight;
 *  - plan: an artist with nothing planned (quiet first, then just out);
 *  - write: a status update for the nearest dated rollout's artist.
 */
export function buildChatSuggestions(rows: readonly SuggestionRow[]): ChatSuggestion[] {
  const inFlight = rows.filter((row) => row.status === 'rolling_out' && row.releaseId && row.title);
  const chips: ChatSuggestion[] = [];

  let worst: SuggestionRow | null = null;
  for (const row of inFlight) if (row.late > 0 && (!worst || row.late > worst.late)) worst = row;
  if (worst) chips.push({ kind: 'late', text: `What is late on ${worst.title}?`, releaseId: worst.releaseId });

  if (inFlight.length > 0) chips.push({ kind: 'today', text: 'What should I do today?', releaseId: null });

  const idle =
    rows.find((row) => row.status === 'quiet') ?? rows.find((row) => row.status === 'out_now') ?? null;
  if (idle && idle.artistName.trim()) {
    chips.push({ kind: 'plan', text: `Plan the next record for ${idle.artistName.trim()}`, releaseId: null });
  }

  let nearest: SuggestionRow | null = null;
  for (const row of inFlight) {
    if (row.daysToGo === null) continue;
    if (!nearest || row.daysToGo < (nearest.daysToGo ?? Infinity)) nearest = row;
  }
  if (nearest) {
    // A first and last name reads as the first name ("for Zainab", as the
    // mock); a one-word or group name ("The Harbour Lights") stays whole.
    const name = nearest.artistName.trim();
    const words = name.split(/\s+/);
    const who = words.length === 2 ? words[0] : name || nearest.title;
    chips.push({ kind: 'write', text: `Write a status update for ${who}`, releaseId: nearest.releaseId });
  }
  return chips;
}
