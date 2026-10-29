// Browser side of the distribution prep tasks (#851). The server decides
// everything (lib/distribution-prep-tasks-server.ts); this only asks.

import { supabase } from '@/lib/supabase/client';

/**
 * Ask the server to add, date or tick the three distribution prep tasks.
 * Resolves to true only when the plan changed, so the caller knows to refresh.
 * Every failure and refusal is a quiet false: the next open tries again.
 */
export async function requestDistributionPrepSync(releaseId: string): Promise<boolean> {
  if (!releaseId) return false;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const response = await fetch(`/api/releases/${releaseId}/distribution-prep`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) return false;
    const body = (await response.json().catch(() => ({}))) as { changed?: boolean };
    return body.changed === true;
  } catch {
    return false;
  }
}
