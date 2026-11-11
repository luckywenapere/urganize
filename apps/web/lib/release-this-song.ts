// "Release this song" (2026-11-11, #1143 slice 2, mock docs/mocks/song-to-review
// screen 1.3). The button on a project opens a sheet that offers three
// Fridays to release on. Fridays are when new music goes out, and
// 9 weeks is enough time to pitch to playlists (Spotify asks for at least a
// week; the single playbook runs 8 weeks before release day). Picking one hands
// the day to the planner, which then skips its date question.

/**
 * The project's main button. The mock said "Release this song", but the app
 * calls the object a rollout and says "release" only for the date (founder
 * rule 2026-09-09, lib/rollout-vocabulary.test.ts), so it names the step.
 */
export const RELEASE_DAY_BUTTON = 'Pick a release day';

export type ReleaseDayOption = {
  /** YYYY-MM-DD */
  date: string;
  weekday: string;
  /** "22 Jan" */
  day: string;
  /** Whole weeks from today. */
  weeks: number;
};

const FIRST_OPTION_DAYS = 63;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Three Fridays a week apart, the first at least 9 weeks after today (YYYY-MM-DD, Lagos). */
export function releaseDayOptions(today: string): ReleaseDayOption[] {
  const start = Date.parse(`${today}T12:00:00Z`);
  const earliest = new Date(start + FIRST_OPTION_DAYS * DAY_MS);
  const toFriday = (5 - earliest.getUTCDay() + 7) % 7;
  const first = earliest.getTime() + toFriday * DAY_MS;
  return [0, 1, 2].map((index) => {
    const when = new Date(first + index * 7 * DAY_MS);
    return {
      date: when.toISOString().slice(0, 10),
      weekday: 'Fri',
      day: `${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]}`,
      weeks: Math.round((when.getTime() - start) / (7 * DAY_MS)),
    };
  });
}
