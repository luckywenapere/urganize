'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * "Not now", "No thanks", "Skip", "Unpin" on advice the app shows (founder,
 * Oct 31, 2026: nothing that is only advice should feel compulsory, #919).
 *
 * Kept in this browser, like the invite strip and the NPS prompt: these are
 * one person's choices about what they want to see, not facts about the
 * rollout. A choice with `days` comes back after that many days; one without
 * stays hidden. Storage can be blocked (private mode), so every read and write
 * is wrapped and a failure simply shows the nudge again.
 */

const PREFIX = 'urganize.hidden.';
const CHANGED = 'urganize:hidden-nudges-changed';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether a stored value still hides its nudge at `now`. Pure, for tests. */
export function isHiddenValue(raw: string | null, now: number): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { until?: unknown };
    if (parsed.until === null) return true;
    return typeof parsed.until === 'number' && parsed.until > now;
  } catch {
    return false;
  }
}

/** The value `hideNudge` stores. Pure, for tests. */
export function hiddenValue(now: number, days?: number): string {
  return JSON.stringify({ until: days ? now + days * DAY_MS : null });
}

export function isNudgeHidden(key: string): boolean {
  try {
    return isHiddenValue(window.localStorage.getItem(PREFIX + key), Date.now());
  } catch {
    return false;
  }
}

export function hideNudge(key: string, days?: number): void {
  try {
    window.localStorage.setItem(PREFIX + key, hiddenValue(Date.now(), days));
  } catch {
    // Storage blocked: the nudge comes back next visit, which is the safe way to fail.
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** [hidden, hide]. Hidden is false on the server and first paint. */
export function useHiddenNudge(key: string, days?: number): [boolean, () => void] {
  const hidden = useSyncExternalStore(
    subscribe,
    () => isNudgeHidden(key),
    () => false
  );
  const hide = useCallback(() => hideNudge(key, days), [key, days]);
  return [hidden, hide];
}

/** The keys among `keys` that are hidden, for a list of items (suggestions). */
export function useHiddenNudgeSet(prefix: string, keys: readonly string[]): [Set<string>, (key: string) => void] {
  const joined = keys.join('\u0000');
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (joined ? joined.split('\u0000') : []).filter((key) => isNudgeHidden(`${prefix}${key}`)).join('\u0000'),
    () => ''
  );
  const hide = useCallback((key: string) => hideNudge(`${prefix}${key}`), [prefix]);
  return [new Set(snapshot ? snapshot.split('\u0000') : []), hide];
}
