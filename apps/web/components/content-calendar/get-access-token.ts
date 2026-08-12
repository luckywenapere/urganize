import { supabase } from '@/lib/supabase/client';

/**
 * The bearer token every content-calendar fetch sends. One copy here instead
 * of the four identical module-scope duplicates CalendarScene / CalendarTabs /
 * CalendarOverflowMenu / PostModal each carried (2026-08-10 refinement pass).
 */
export async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}
