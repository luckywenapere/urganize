import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArtistFact } from '@/lib/artist-facts';
import type { FactArtist } from '@/lib/artist-facts-server';
import { logUrgansAction } from '@/lib/urgans-action-log-server';

/**
 * A fact changed by hand on the artist page still goes in the UrgAns action
 * log, because it changes what UrgAns reads. Saves from chat are logged by
 * the tool dispatcher instead (lib/chappi/dispatch.ts). Never throws.
 */
export async function logFactEdit(
  admin: SupabaseClient,
  params: {
    tool: 'memory.save_fact' | 'memory.forget_fact';
    userId: string;
    artist: FactArtist;
    before: ArtistFact | null;
    after: ArtistFact | null;
  }
) {
  const { tool, userId, artist, before, after } = params;
  const fact = after ?? before;
  await logUrgansAction(admin, {
    source: 'memory',
    trigger: 'artist_page',
    tool,
    level: 'auto',
    actorUserId: userId,
    workspaceId: artist.workspaceId,
    objectType: 'artist_fact',
    objectId: fact?.id ?? null,
    before,
    after,
    // A person did this themselves, on the page.
    confirmed: true,
    ok: true,
    summary: after
      ? `${artist.name}: ${after.topic} set to "${after.value}" by hand.`
      : `${artist.name}: removed "${before?.value ?? ''}" by hand.`,
  });
}
