/**
 * The menu of moves UrgAns plans from (planner v2, 2026-10-24).
 *
 * Two sources. The hand-made playbooks stay the source of the craft: every
 * template task becomes a move with its own lead time, role and tags. On top
 * sits the Nigeria pack, the moves the playbooks never had (findings.md:
 * Audiomack, Boomplay, OAPs, DJs, blogs, skit makers, shows, merch), each with
 * a lead time and a rough Naira range.
 *
 * The menu is guidance plus price and lead-time sanity, not a fence: UrgAns may
 * use, merge, reword or write tasks that are not on it (founder approved, 24
 * Oct 2026). The validator (./validate.ts) is the fence.
 *
 * Naira ranges are first estimates for Oyin to review (proposal decision 4).
 */

import type { Template, TemplateTask, TaskRole } from '../release-templates/types';
import type { Channel, WinGoal } from './answers';

/** Where a task does its work. The nine platform channels are gated by the
 *  manager's picks; the rest are kinds of work any plan may hold. */
export const TASK_CHANNELS = [
  'audiomack',
  'boomplay',
  'spotify',
  'apple',
  'youtube',
  'tiktok',
  'instagram',
  'x',
  'radio',
  'blogs',
  'djs',
  'shows',
  'merch',
  'distribution',
  'none',
] as const;
export type TaskChannel = (typeof TASK_CHANNELS)[number];

/** Channels only allowed when the manager picked them on Q5. */
export const PICKABLE_TASK_CHANNELS: readonly TaskChannel[] = [
  'audiomack',
  'boomplay',
  'spotify',
  'apple',
  'youtube',
  'tiktok',
  'instagram',
  'x',
  'radio',
];

export type Move = {
  id: string;
  title: string;
  what: string;
  channel: TaskChannel;
  role: TaskRole;
  /** Days before release day it usually starts (negative = before). */
  offset_days: number;
  /** Rough cost in Naira, [low, high]. [0, 0] is free. */
  naira: [number, number];
  /** Wins it serves most. */
  wins: WinGoal[];
  /** Fits a song that is already out. */
  push?: boolean;
  depends_on?: string[];
};

export const NIGERIA_PACK: Move[] = [
  {
    id: 'ng_audiomack_editorial',
    title: 'Pitch Audiomack editorial',
    what: 'Send the song to Audiomack’s editorial team through the artist dashboard or your distributor.',
    channel: 'audiomack',
    role: 'manager',
    offset_days: -21,
    naira: [0, 0],
    wins: ['streams', 'playlists'],
    push: true,
  },
  {
    id: 'ng_boomplay_editorial',
    title: 'Pitch Boomplay editorial',
    what: 'Pitch the song to Boomplay’s editors (Boomplay for Artists, or your distributor’s rep).',
    channel: 'boomplay',
    role: 'manager',
    offset_days: -21,
    naira: [0, 0],
    wins: ['streams', 'playlists'],
    push: true,
  },
  {
    id: 'ng_spotify_editorial',
    title: 'Pitch Spotify editorial',
    what: 'Pitch the unreleased song in Spotify for Artists at least 7 days before release.',
    channel: 'spotify',
    role: 'manager',
    offset_days: -21,
    naira: [0, 0],
    wins: ['streams', 'playlists'],
  },
  {
    id: 'ng_apple_pitch',
    title: 'Pitch Apple Music',
    what: 'Pitch through your distributor’s Apple Music form.',
    channel: 'apple',
    role: 'manager',
    offset_days: -21,
    naira: [0, 0],
    wins: ['playlists'],
  },
  {
    id: 'ng_curator_pitch',
    title: 'Pitch independent playlist curators',
    what: 'Send the song to 10 to 20 curators who playlist this sound.',
    channel: 'spotify',
    role: 'manager',
    offset_days: -14,
    naira: [0, 50_000],
    wins: ['playlists', 'streams'],
    push: true,
  },
  {
    id: 'ng_oap_pitch',
    title: 'Pitch OAPs and radio in your city',
    what: 'Send the clean version and a short note to on-air personalities and music directors.',
    channel: 'radio',
    role: 'manager',
    offset_days: -7,
    naira: [0, 150_000],
    wins: ['radio_djs'],
    push: true,
  },
  {
    id: 'ng_dj_pack',
    title: 'Send a DJ pack',
    what: 'Clean, dirty and instrumental versions plus artwork to club and mixtape DJs.',
    channel: 'djs',
    role: 'manager',
    offset_days: -7,
    naira: [0, 100_000],
    wins: ['radio_djs', 'streams'],
    push: true,
  },
  {
    id: 'ng_blog_post',
    title: 'Book Nigerian blog posts',
    what: 'Place the song on music blogs your fans read.',
    channel: 'blogs',
    role: 'marketing_lead',
    offset_days: -3,
    naira: [30_000, 100_000],
    wins: ['press'],
    push: true,
  },
  {
    id: 'ng_tiktok_creators',
    title: 'Book TikTok creators',
    what: 'Pay 3 to 10 creators to use the sound in their videos.',
    channel: 'tiktok',
    role: 'marketing_lead',
    offset_days: -5,
    naira: [50_000, 300_000],
    wins: ['tiktok', 'streams'],
    push: true,
  },
  {
    id: 'ng_skit_makers',
    title: 'Place the song in a skit',
    what: 'Get a skit maker to use the song in a skit.',
    channel: 'instagram',
    role: 'marketing_lead',
    offset_days: 3,
    naira: [100_000, 500_000],
    wins: ['streams', 'tiktok'],
    push: true,
  },
  {
    id: 'ng_own_content',
    title: 'Shoot a week of short videos',
    what: 'Film 5 to 7 short clips of the song for TikTok, Reels and Shorts.',
    channel: 'tiktok',
    role: 'artist',
    offset_days: -14,
    naira: [0, 30_000],
    wins: ['tiktok', 'streams'],
    push: true,
  },
  {
    id: 'ng_meta_ads',
    title: 'Run Meta ads to the song',
    what: 'Small Instagram/Facebook ads aimed at fans of similar artists.',
    channel: 'instagram',
    role: 'marketing_lead',
    offset_days: 0,
    naira: [50_000, 500_000],
    wins: ['streams'],
    push: true,
  },
  {
    id: 'ng_x_spaces',
    title: 'Host an X Space listening session',
    what: 'Play the song live on X and talk about it with fans.',
    channel: 'x',
    role: 'artist',
    offset_days: 1,
    naira: [0, 0],
    wins: ['streams', 'press'],
    push: true,
  },
  {
    id: 'ng_street_team',
    title: 'Get friends to post on release day',
    what: 'A street team of friends and fans sharing the link on release day.',
    channel: 'none',
    role: 'artist',
    offset_days: 0,
    naira: [0, 0],
    wins: ['streams'],
    push: true,
  },
  {
    id: 'ng_campus_promo',
    title: 'Run campus promo',
    what: 'Campus reps play and share the song at a few schools.',
    channel: 'none',
    role: 'manager',
    offset_days: 7,
    naira: [30_000, 150_000],
    wins: ['streams', 'shows'],
    push: true,
  },
  {
    id: 'ng_listening_party',
    title: 'Hold a listening party',
    what: 'A small event for fans and press to hear the song first.',
    channel: 'shows',
    role: 'manager',
    offset_days: -3,
    naira: [100_000, 500_000],
    wins: ['shows', 'press'],
  },
  {
    id: 'ng_show_booking',
    title: 'Pitch the artist to show promoters',
    what: 'Send a short booking pitch to promoters and venues.',
    channel: 'shows',
    role: 'manager',
    offset_days: 7,
    naira: [0, 0],
    wins: ['shows'],
    push: true,
  },
  {
    id: 'ng_merch_drop',
    title: 'Drop merch with the release',
    what: 'A small run of shirts or caps sold to fans.',
    channel: 'merch',
    role: 'manager',
    offset_days: 0,
    naira: [150_000, 800_000],
    wins: ['merch'],
    push: true,
  },
  {
    id: 'ng_youtube_premiere',
    title: 'Premiere the video on YouTube',
    what: 'Schedule a premiere and share the link a day before.',
    channel: 'youtube',
    role: 'artist',
    offset_days: 0,
    naira: [0, 0],
    wins: ['streams'],
  },
];

/** The moves every plan for an unreleased song holds. */
export const RELEASE_DAY_MOVE: Move = {
  id: 'release_day',
  title: 'Release day: share the song everywhere',
  what: 'The song is out. Post the link, thank people, check every platform has it.',
  channel: 'none',
  role: 'artist',
  offset_days: 0,
  naira: [0, 0],
  wins: [],
};

export const DISTRIBUTOR_MOVE: Move = {
  id: 'deliver_to_distributor',
  title: 'Send the song to your distributor',
  what: 'Upload the master, cover art and details so it is live on release day.',
  channel: 'distribution',
  role: 'distributor_contact',
  offset_days: -21,
  naira: [0, 0],
  wins: [],
};

/**
 * The smart link (Altlink, made by itself from the rollout's details): every
 * plan for an unreleased song holds it, two weeks out (Oyin, Oct 29, 2026,
 * #850). Always called "smart link", never "pre-save link", in what we write.
 */
export const SMART_LINK_MOVE: Move = {
  id: 'smart_link',
  title: 'Set up and share your smart link',
  what: 'Fans save the song now and get it on release day. Share the link everywhere the artist posts.',
  channel: 'none',
  role: 'manager',
  offset_days: -14,
  naira: [0, 0],
  wins: [],
};

/** Guess a template task's channel from its tags and words. */
export function channelForTemplateTask(task: Pick<TemplateTask, 'tags' | 'title' | 'description'>): TaskChannel {
  const tags = task.tags ?? [];
  const words = `${task.title} ${task.description}`.toLowerCase();
  if (tags.includes('distribution')) return 'distribution';
  if (/tiktok/.test(words)) return 'tiktok';
  if (/youtube|visuali[sz]er/.test(words)) return 'youtube';
  if (/instagram|reels/.test(words)) return 'instagram';
  if (/apple music/.test(words)) return 'apple';
  if (tags.includes('editorial') || /spotify|playlist|pre-?save/.test(words)) return 'spotify';
  if (/radio/.test(words)) return 'radio';
  if (/\bpress\b|blog/.test(words)) return 'blogs';
  if (tags.includes('event')) return 'shows';
  if (tags.includes('physical')) return 'merch';
  return 'none';
}

/** Every template task as a move. Paid ads get a rough range; the rest are free. */
export function movesFromTemplate(template: Template): Move[] {
  return template.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    what: task.description,
    channel: channelForTemplateTask(task),
    role: task.role,
    offset_days: task.offset_days,
    naira: (task.tags ?? []).includes('paid') ? [50_000, 300_000] : [0, 0],
    wins: [],
    push: task.offset_days > 0,
    depends_on: task.depends_on,
  }));
}

/** The menu for one plan: the Nigeria pack first, then the playbook. */
export function buildMoveMenu(template: Template, picked: readonly Channel[]): Move[] {
  const allowed = new Set<TaskChannel>([...picked, 'blogs', 'djs', 'shows', 'merch', 'distribution', 'none']);
  return [RELEASE_DAY_MOVE, DISTRIBUTOR_MOVE, SMART_LINK_MOVE, ...NIGERIA_PACK, ...movesFromTemplate(template)].filter((move) =>
    allowed.has(move.channel)
  );
}

/** One compact line per move for the prompt. */
export function moveLine(move: Move): string {
  const cost = move.naira[1] === 0 ? 'free' : `₦${move.naira[0]}-${move.naira[1]}`;
  return `${move.id} | ${move.title} | ${move.channel} | ${move.role} | day ${move.offset_days} | ${cost}`;
}
