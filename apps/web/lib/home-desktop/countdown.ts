// The Drops column of the artists list on Home on a computer (#1305): the
// count and the day on one line, "8 days · Wed 18 Nov", with the number apart
// so it can be drawn bigger and line up under the heading.

export type DropCountdown = {
  /** The count to draw big, or null when there is no count to show. */
  number: string | null;
  rest: string;
  /** The whole line, for a screen reader. */
  text: string;
};

export function dropCountdown(daysToGo: number | null, day: string | null): DropCountdown | null {
  if (daysToGo === null || !day) return null;
  if (daysToGo > 0) {
    const rest = `${daysToGo === 1 ? 'day' : 'days'} · ${day}`;
    return { number: String(daysToGo), rest, text: `${daysToGo} ${rest}` };
  }
  const rest = `${daysToGo === 0 ? 'Today' : 'Out'} · ${day}`;
  return { number: null, rest, text: rest };
}
