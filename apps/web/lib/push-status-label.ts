/**
 * The short state shown beside the Push notifications row when there is no
 * button to press. The long explanation lives in the info tip, which nobody
 * finds on their own, so the state itself has to be visible (QA, 2026-10-21).
 * A browser or phone that blocked them cannot be turned on from here.
 */
export function pushStatusLabel(status: 'unsupported' | 'blocked' | string, native: boolean): string | null {
  if (status === 'blocked') return native ? 'Blocked on this phone' : 'Blocked in this browser';
  if (status === 'unsupported') return 'Not available here';
  return null;
}
