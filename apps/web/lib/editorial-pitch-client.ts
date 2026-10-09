// Browser side of the once-only Spotify pitch backfill. The decisions live on
// the server (lib/editorial-pitch-server.ts); this only asks, once per rollout
// per session, and reports whether the plan changed.

import { supabase } from '@/lib/supabase/client';

/** Rollouts already asked about in this tab, so opening one twice asks once. */
const asked = new Set<string>();

/**
 * Ask the server to add the Spotify pitch to a rollout planned before it
 * existed. Resolves to true only when the plan changed (a task was added or an
 * old pitch converted), so the caller knows to refresh. Every failure, refusal
 * and "nothing to do" answer is a quiet false: a person who cannot write simply
 * gets the step when somebody who can opens the rollout.
 */
export async function requestEditorialPitchBackfill(releaseId: string): Promise<boolean> {
  if (!releaseId || asked.has(releaseId)) return false;
  asked.add(releaseId);
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      asked.delete(releaseId);
      return false;
    }
    const response = await fetch(`/api/releases/${releaseId}/editorial-pitch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) return false;
    const body = (await response.json().catch(() => ({}))) as { outcome?: string };
    return body.outcome === 'added' || body.outcome === 'converted';
  } catch {
    // Offline or a blip: try again the next time the rollout is opened.
    asked.delete(releaseId);
    return false;
  }
}
