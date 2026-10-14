import type { ReturnCell } from './admin-signup-return';

// How the weekly-return table (./admin-signup-return.ts, URG-267) reads as
// words. Kept apart from the counting rules so the admin page ships only this.
// Types only from there.

/** "3/7 · 43%" for a finished week; "—" for a week nobody signed up in;
 *  "" (left blank) for a week that is not over yet. Counts come first because
 *  the cohorts are small and a percentage alone overstates them. */
export function formatReturnCell(cell: ReturnCell | null): string {
  if (!cell) return '';
  if (cell.size === 0 || cell.rate === null) return '—';
  return `${cell.returned}/${cell.size} · ${Math.round(cell.rate * 100)}%`;
}
