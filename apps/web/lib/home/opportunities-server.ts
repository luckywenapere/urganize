import type { SupabaseClient } from '@supabase/supabase-js';
import { listOpportunities } from '@/lib/opportunities-server';
import { listGrantSuggestions } from '@/lib/grants/suggestions-server';
import { grantSuggestionsEnabled } from '@/lib/grants/grant-suggestions-flag';
import { todayKey } from '@/lib/opportunities';
import { pickHomeOpportunities, type HomeOpportunityItem } from './opportunities-card';

/**
 * Home's opportunities, read on the server inside GET /api/home (URG-320) so
 * Home is one request. The same two sources and the same pick as the card had
 * (URG-266): matched grant suggestions first, then the team's own open ones.
 *
 * Null when the viewer may not see team opportunities (no team, or a teammate
 * limited to one artist) or the read failed, so Home leaves them out.
 */
export async function loadHomeOpportunities(
  adminClient: SupabaseClient,
  workspaceId: string | null,
  artistScoped: boolean,
  now: Date = new Date()
): Promise<HomeOpportunityItem[] | null> {
  if (!workspaceId || artistScoped) return null;
  try {
    const [saved, suggested] = await Promise.all([
      listOpportunities(adminClient, workspaceId),
      grantSuggestionsEnabled() ? listGrantSuggestions(adminClient, workspaceId, now) : null,
    ]);
    if (!saved.ok) return null;
    return pickHomeOpportunities(
      { suggestions: suggested && suggested.ok ? suggested.suggestions : [], opportunities: saved.opportunities },
      todayKey(now)
    );
  } catch (error) {
    console.warn('[home] could not load opportunities', error);
    return null;
  }
}
