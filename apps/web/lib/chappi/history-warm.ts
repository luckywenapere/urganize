'use client';

/**
 * Warms UrgAns chat history right after sign-in (URG-314, Oyin approved
 * option C on Oct 16, 2026), without loading the history store on signed-out
 * routes. AppShell calls it as soon as a user is known; it fires the list
 * request and the Home chat request (the Home chat's id is the user id) in
 * parallel. The store, started later by ChappiHistoryBridge in the workspace
 * layout, takes each response once instead of asking again, so Home opens on
 * the last chat with no greeting flash. A warm older than WARM_MAX_AGE_MS is
 * ignored and the store fetches as before.
 */
import { supabase } from '@/lib/supabase/client';

const WARM_MAX_AGE_MS = 20_000;
type Key = 'list' | 'home';
type Warm = { userId: string; at: number; list: Promise<Response | null> | null; home: Promise<Response | null> | null };
let warm: Warm | null = null;

export function warmChappiHistory(userId: string): void {
  if (!userId || (warm && warm.userId === userId && Date.now() - warm.at <= WARM_MAX_AGE_MS)) return;
  const token = supabase.auth
    .getSession()
    .then(({ data }) => data.session?.access_token || '')
    .catch(() => '');
  const get = (url: string) =>
    token.then((t) =>
      t
        ? fetch(url, { headers: { Authorization: `Bearer ${t}`, 'x-urganize-prefetch': '1' }, cache: 'no-store' }).catch(() => null)
        : null
    );
  warm = { userId, at: Date.now(), list: get('/api/urgans/conversations'), home: get(`/api/urgans/conversations/${userId}`) };
}

/** The warmed response for this user, once; null when there is none. */
export function takeWarmedHistory(userId: string, key: Key): Promise<Response | null> | null {
  if (!warm || warm.userId !== userId || Date.now() - warm.at > WARM_MAX_AGE_MS) return null;
  const pending = warm[key];
  warm[key] = null;
  return pending;
}
