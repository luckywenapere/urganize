// Open gig calls (URG-303, founder 2026-10-15). Shows left Relationships: a
// show still pencilled in is a gig the team is chasing, so Opportunities lists
// it; once confirmed it is a booked show and lives on its artist's page under
// Catalogue. Pure, so the rule is unit tested and the page only draws it.

export type GigCallShow = {
  id: string;
  status: string;
  setStartAt: string | null;
};

/** Pencilled-in shows that have not happened yet, soonest first; a show with
 *  no date yet is still open and sorts last. */
export function openGigCalls<T extends GigCallShow>(shows: T[], now: Date = new Date()): T[] {
  const nowMs = now.getTime();
  const timeOf = (show: T): number | null => {
    if (!show.setStartAt) return null;
    const ms = new Date(show.setStartAt).getTime();
    return Number.isNaN(ms) ? null : ms;
  };
  return shows
    .filter((show) => {
      if (show.status !== 'draft') return false;
      const time = timeOf(show);
      return time === null || time >= nowMs;
    })
    .sort((a, b) => (timeOf(a) ?? Infinity) - (timeOf(b) ?? Infinity));
}
