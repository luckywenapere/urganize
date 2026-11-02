import { registerSignOutReset } from './sign-out-resets';

// The last copy of a screen's data seen in this page life, kept in memory only
// (Nov 2, 2026, the load-wait audit). A screen paints it at once on a repeat
// visit and refreshes in the background, instead of starting blank. Memory, not
// the device: nothing outlives the tab, and sign-out empties it.

const seen = new Map<string, unknown>();

export function rememberLast<T>(kind: string, id: string, value: T): void {
  if (!id) return;
  seen.set(`${kind}:${id}`, value);
}

export function recallLast<T>(kind: string, id: string): T | null {
  if (!id) return null;
  return (seen.get(`${kind}:${id}`) as T | undefined) ?? null;
}

export function forgetAllLastSeen(): void {
  seen.clear();
}

registerSignOutReset('last-seen', forgetAllLastSeen);
