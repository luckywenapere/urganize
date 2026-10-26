/**
 * Plan with UrgAns v2 (2026-10-24, founder approved proposal + mock): the
 * answers the new intake collects, their plain labels, and the mapping back to
 * the older ReleasePlanIntake that `releases.release_context` and the plan
 * document still store.
 *
 * Pure and React-free so vitest reaches it. The questions themselves live in
 * components/planner/intake-steps-v2.tsx; which ones are asked is
 * {@link visibleV2Steps}.
 */

import type { PlanBudget, PlanGoal, PlanReleaseType, ReadyItem, ReleasePlanIntake } from '../release-planning';

export const isPlannerV2Enabled = (): boolean => process.env.NEXT_PUBLIC_FEATURE_PLANNER_V2 !== 'false';

export type MusicStage = 'making' | 'finished' | 'out';
export type FinishedReady = 'cover_art' | 'video' | 'distributor';
export type OutWhen = 'this_week' | 'this_month' | 'earlier';
export type WinGoal = 'streams' | 'playlists' | 'radio_djs' | 'press' | 'tiktok' | 'shows' | 'merch';
export type BudgetBand = 'zero' | 'under_100k' | '100k_500k' | '500k_2m' | 'over_2m';
export type Channel =
  | 'audiomack'
  | 'boomplay'
  | 'spotify'
  | 'apple'
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'radio';
export type City = 'lagos' | 'abuja' | 'ph' | 'ibadan' | 'enugu' | 'other';
export type TeamSize = 'solo' | 'small' | 'full';

export type PlannerV2Answers = {
  version: 3;
  release_type: PlanReleaseType;
  artist_name: string;
  /** Q1 */
  stage: MusicStage;
  /** Q1, when finished: what is ready besides the music. */
  ready: FinishedReady[];
  /** Q1, EP/album only: drop a single first. Null when not asked. */
  single_first: boolean | null;
  /** YYYY-MM-DD or null. Never asked for music not out yet (2026-10-26): it
   *  comes from the rollout row when one is set. For "already out", the day
   *  it came out (derived from out_when when unknown). */
  release_date: string | null;
  date_mode: 'fixed' | 'suggested';
  /** Q2 when already out. */
  out_when: OutWhen | null;
  /** Q3 */
  wins: WinGoal[];
  win_text: string;
  /** Q3 branch: radio/DJs or shows. */
  cities: City[];
  /** Q4 */
  budget: BudgetBand;
  budget_exact: number | null;
  /** Q5 */
  channels: Channel[];
  /** Q6 */
  team: TeamSize;
  /** The optional box on the last screen. */
  notes: string;
};

export const MAX_WIN_TEXT = 200;
export const MAX_NOTES = 1000;
export const MAX_EXACT_BUDGET = 100_000_000;

export const STAGE_OPTIONS: Array<{ value: MusicStage; label: string }> = [
  { value: 'making', label: 'Still making it' },
  { value: 'finished', label: 'Finished, not out yet' },
  { value: 'out', label: 'Already out' },
];

export const READY_OPTIONS: Array<{ value: FinishedReady; label: string }> = [
  { value: 'cover_art', label: 'Cover art ready' },
  { value: 'video', label: 'Video ready' },
  { value: 'distributor', label: 'Distributor set up' },
];

export const OUT_WHEN_OPTIONS: Array<{ value: OutWhen; label: string }> = [
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'earlier', label: 'Earlier' },
];

export const WIN_OPTIONS: Array<{ value: WinGoal; label: string }> = [
  { value: 'streams', label: 'More streams & new fans' },
  { value: 'playlists', label: 'Playlist adds' },
  { value: 'radio_djs', label: 'Radio & DJ spins' },
  { value: 'press', label: 'Blog & press buzz' },
  { value: 'tiktok', label: 'Grow on TikTok' },
  { value: 'shows', label: 'Shows & bookings' },
  { value: 'merch', label: 'Sell merch, make money back' },
];

export const CITY_OPTIONS: Array<{ value: City; label: string }> = [
  { value: 'lagos', label: 'Lagos' },
  { value: 'abuja', label: 'Abuja' },
  { value: 'ph', label: 'PH' },
  { value: 'ibadan', label: 'Ibadan' },
  { value: 'enugu', label: 'Enugu' },
  { value: 'other', label: 'Other' },
];

export const BUDGET_BAND_OPTIONS: Array<{ value: BudgetBand; label: string }> = [
  { value: 'zero', label: '₦0' },
  { value: 'under_100k', label: 'Under ₦100k' },
  { value: '100k_500k', label: '₦100k–₦500k' },
  { value: '500k_2m', label: '₦500k–₦2m' },
  { value: 'over_2m', label: 'Over ₦2m' },
];

/** The most the plan may spend for a band when no exact amount is given. */
export const BUDGET_BAND_CEILING: Record<BudgetBand, number> = {
  zero: 0,
  under_100k: 100_000,
  '100k_500k': 500_000,
  '500k_2m': 2_000_000,
  over_2m: 2_000_000,
};

export const CHANNEL_OPTIONS: Array<{ value: Channel; label: string }> = [
  { value: 'audiomack', label: 'Audiomack' },
  { value: 'boomplay', label: 'Boomplay' },
  { value: 'spotify', label: 'Spotify' },
  { value: 'apple', label: 'Apple Music' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X' },
  { value: 'radio', label: 'Radio' },
];

/** Preselected for Nigeria (proposal Q5). */
export const DEFAULT_CHANNELS: Channel[] = ['audiomack', 'boomplay', 'spotify', 'tiktok'];

export const TEAM_OPTIONS: Array<{ value: TeamSize; label: string }> = [
  { value: 'solo', label: 'Just me' },
  { value: 'small', label: 'Me + 1–3 people' },
  { value: 'full', label: 'Full team' },
];

/** Plan size and pace by team (proposal Q6). */
export const TEAM_PACE: Record<TeamSize, { min: number; max: number; perWeek: number }> = {
  solo: { min: 10, max: 12, perWeek: 3 },
  small: { min: 12, max: 15, perWeek: 4 },
  full: { min: 14, max: 18, perWeek: 6 },
};

const label = <T extends string>(options: Array<{ value: T; label: string }>, value: T): string =>
  options.find((option) => option.value === value)?.label ?? value;

export const stageLabel = (value: MusicStage) => label(STAGE_OPTIONS, value);
export const winLabel = (value: WinGoal) => label(WIN_OPTIONS, value);
export const channelLabel = (value: Channel) => label(CHANNEL_OPTIONS, value);
export const cityLabel = (value: City) => label(CITY_OPTIONS, value);
export const teamLabel = (value: TeamSize) => label(TEAM_OPTIONS, value);
export const budgetBandLabel = (value: BudgetBand) => label(BUDGET_BAND_OPTIONS, value);

/** The wins that ask "Which cities?". */
export const winsNeedCities = (wins: readonly WinGoal[]): boolean =>
  wins.includes('radio_djs') || wins.includes('shows');

/** The Naira the plan may spend: the exact amount when given, else the band's ceiling. */
export function plannedBudget(answers: Pick<PlannerV2Answers, 'budget' | 'budget_exact'>): number {
  if (answers.budget === 'zero') return 0;
  if (typeof answers.budget_exact === 'number' && answers.budget_exact > 0) {
    return Math.min(Math.round(answers.budget_exact), MAX_EXACT_BUDGET);
  }
  return BUDGET_BAND_CEILING[answers.budget];
}

/** ₦250k, ₦1.2m, ₦0. */
export function formatNaira(value: number): string {
  const n = Math.max(0, Math.round(value));
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `₦${Number.isInteger(m) ? m : m.toFixed(1).replace(/\.0$/, '')}m`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `₦${Number.isInteger(k) ? k : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `₦${n}`;
}

export const EMPTY_V2_ANSWERS: PlannerV2Answers = {
  version: 3,
  release_type: 'single',
  artist_name: '',
  stage: 'finished',
  ready: [],
  single_first: null,
  release_date: null,
  date_mode: 'fixed',
  out_when: null,
  wins: [],
  win_text: '',
  cities: [],
  budget: 'under_100k',
  budget_exact: null,
  channels: [...DEFAULT_CHANNELS],
  team: 'solo',
  notes: '',
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(options: Array<{ value: T }>, value: unknown): value is T =>
  options.some((option) => option.value === value);
const listOf = <T extends string>(options: Array<{ value: T }>, value: unknown): T[] => {
  if (!Array.isArray(value)) return [];
  const set = new Set(value.filter((item): item is T => oneOf(options, item)));
  return options.map((option) => option.value).filter((item) => set.has(item));
};

/** Validate answers from an untrusted body. */
export function parsePlannerV2Answers(
  value: unknown
): { ok: true; answers: PlannerV2Answers } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') return { ok: false, error: 'answers must be an object.' };
  const r = value as Record<string, unknown>;
  if (r.version !== 3) return { ok: false, error: 'answers must be version 3.' };
  const releaseType = r.release_type;
  if (releaseType !== 'single' && releaseType !== 'ep' && releaseType !== 'album') {
    return { ok: false, error: 'release_type must be single, ep or album.' };
  }
  if (!oneOf(STAGE_OPTIONS, r.stage)) return { ok: false, error: 'Tell UrgAns where the music is.' };
  if (!oneOf(BUDGET_BAND_OPTIONS, r.budget)) return { ok: false, error: 'Pick a promo budget.' };
  if (!oneOf(TEAM_OPTIONS, r.team)) return { ok: false, error: "Pick who's doing the work." };
  const wins = listOf(WIN_OPTIONS, r.wins);
  const winText = typeof r.win_text === 'string' ? r.win_text.trim().slice(0, MAX_WIN_TEXT) : '';
  if (wins.length === 0 && !winText) return { ok: false, error: 'Pick what would make this a win.' };
  const channels = listOf(CHANNEL_OPTIONS, r.channels);
  if (channels.length === 0) return { ok: false, error: 'Pick at least one place your fans listen.' };

  let releaseDate: string | null = null;
  if (typeof r.release_date === 'string' && r.release_date) {
    const d = r.release_date.slice(0, 10);
    if (!YMD.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
      return { ok: false, error: 'release_date must be YYYY-MM-DD.' };
    }
    releaseDate = d;
  }
  const outWhen = oneOf(OUT_WHEN_OPTIONS, r.out_when) ? r.out_when : null;
  if (r.stage === 'out' && !outWhen && !releaseDate) {
    return { ok: false, error: 'Tell UrgAns when it came out.' };
  }
  // No date is fine (2026-10-26, Oyin): the plan is built relative to
  // release day and dated when the "Set your release date" row is used.

  const exactRaw = typeof r.budget_exact === 'number' ? r.budget_exact : Number(r.budget_exact);
  const budgetExact =
    r.budget !== 'zero' && Number.isFinite(exactRaw) && exactRaw > 0
      ? Math.min(Math.round(exactRaw), MAX_EXACT_BUDGET)
      : null;

  const artist = typeof r.artist_name === 'string' ? r.artist_name.trim().slice(0, 120) : '';

  return {
    ok: true,
    answers: {
      version: 3,
      release_type: releaseType,
      artist_name: artist || 'The artist',
      stage: r.stage,
      ready: r.stage === 'finished' ? listOf(READY_OPTIONS, r.ready) : [],
      single_first: releaseType !== 'single' && r.stage !== 'out' && typeof r.single_first === 'boolean' ? r.single_first : null,
      release_date: releaseDate,
      date_mode: r.date_mode === 'suggested' ? 'suggested' : 'fixed',
      out_when: r.stage === 'out' ? (outWhen as OutWhen | null) : null,
      wins,
      win_text: winText,
      cities: winsNeedCities(wins) ? listOf(CITY_OPTIONS, r.cities) : [],
      budget: r.budget,
      budget_exact: budgetExact,
      channels,
      team: r.team,
      notes: typeof r.notes === 'string' ? r.notes.trim().slice(0, MAX_NOTES) : '',
    },
  };
}

const MS_DAY = 86_400_000;
const addDays = (ymd: string, days: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + days * MS_DAY).toISOString().slice(0, 10);

/** For a song that is already out with no date on file: a fair guess at the day it came out. */
export function outReleaseDate(outWhen: OutWhen | null, todayYmd: string): string {
  if (outWhen === 'this_week') return addDays(todayYmd, -3);
  if (outWhen === 'earlier') return addDays(todayYmd, -60);
  return addDays(todayYmd, -14);
}

/** Whole days from `fromYmd` to `toYmd`. */
export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / MS_DAY);
}

const WIN_TO_GOAL: Record<WinGoal, PlanGoal> = {
  streams: 'new_listeners',
  playlists: 'playlist_adds',
  radio_djs: 'new_listeners',
  press: 'press',
  tiktok: 'new_listeners',
  shows: 'fan_moment',
  merch: 'fan_moment',
};

const BAND_TO_BUDGET: Record<BudgetBand, PlanBudget> = {
  zero: 'none',
  under_100k: 'under_100k',
  '100k_500k': '100k_500k',
  '500k_2m': 'over_500k',
  over_2m: 'over_500k',
};

/** What is already done, in the older readiness vocabulary. */
export function readyTodayFor(answers: Pick<PlannerV2Answers, 'stage' | 'ready'>): ReadyItem[] {
  if (answers.stage === 'making') return ['none'];
  if (answers.stage === 'out') return ['master', 'artwork', 'distributor'];
  const items: ReadyItem[] = ['master'];
  if (answers.ready.includes('cover_art')) items.push('artwork');
  if (answers.ready.includes('video')) items.push('visualizer');
  if (answers.ready.includes('distributor')) items.push('distributor');
  return items;
}

/**
 * The older intake shape, for `releases.release_context` and the plan
 * document, so everything that reads them (the plan summary, prefill, the
 * chat tools) keeps working.
 */
export function toLegacyIntake(answers: PlannerV2Answers, releaseDate: string | null): ReleasePlanIntake {
  const goalText = [answers.wins.map(winLabel).join(', '), answers.win_text].filter(Boolean).join('. ');
  return {
    version: 2,
    release_type: answers.release_type,
    artist_name: answers.artist_name,
    date_mode: answers.date_mode,
    release_date: releaseDate,
    ready_today: readyTodayFor(answers),
    goal: WIN_TO_GOAL[answers.wins[0] ?? 'streams'],
    ...(goalText ? { goal_text: goalText.slice(0, 300) } : {}),
    budget: BAND_TO_BUDGET[answers.budget],
    ...(answers.notes ? { extra_notes: answers.notes.slice(0, 2000) } : {}),
  };
}

/** The chips on the "Built for you" card, in the mock's order. */
export function answerChips(answers: PlannerV2Answers, releaseDateLabel: string | null): string[] {
  const chips: string[] = [];
  chips.push(
    answers.stage === 'making' ? 'Still making it' : answers.stage === 'out' ? 'Already out' : 'Finished song'
  );
  if (releaseDateLabel && answers.stage !== 'out') chips.push(releaseDateLabel);
  chips.push(formatNaira(plannedBudget(answers)));
  chips.push(teamLabel(answers.team));
  for (const channel of answers.channels) chips.push(channelLabel(channel));
  for (const city of answers.cities) chips.push(cityLabel(city));
  return chips;
}
