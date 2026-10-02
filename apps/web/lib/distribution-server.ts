// Distribution, step one: the reads and the one write. Server only. The rules
// and the copy are lib/distribution.ts; this file only fetches the facts those
// rules need and records that a team went across to the partner.
//
// Nothing here throws into a request: a read that fails answers "not there",
// which makes the checklist ask for the thing again, the safe way to be wrong
// on a page that gates nothing.

import type { SupabaseClient } from '@supabase/supabase-js';
import { SONG_CATEGORY } from './song';
import { logBillingEvent } from './billing-events-server';
import type { DistributionFacts } from './distribution';

const HANDOFF_EVENT = 'distribution_handoff' as const;

type ReleaseForFacts = {
  id: string;
  ownerUserId: string;
  releaseDate: string | null;
  artworkAssetId: string | null;
};

export type DistributionPayload = {
  facts: DistributionFacts;
  /** When this rollout's team last opened the partner's sign-up, or null. */
  lastHandoffAt: string | null;
};

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

export async function loadDistributionFacts(
  admin: SupabaseClient,
  release: ReleaseForFacts
): Promise<DistributionPayload> {
  const [songResult, metadataResult, creditsResult, handoffResult] = await Promise.all([
    admin
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('release_id', release.id)
      .eq('category', SONG_CATEGORY),
    admin
      .from('release_metadata')
      .select('genre,language,explicit,label_name')
      .eq('release_id', release.id)
      .maybeSingle(),
    admin
      .from('release_credit_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('release_id', release.id),
    admin
      .from('billing_events')
      .select('created_at')
      .eq('type', HANDOFF_EVENT)
      .eq('metadata->>releaseId', release.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const row = metadataResult.error ? null : (metadataResult.data as Record<string, unknown> | null);
  const lastHandoff = handoffResult.error
    ? null
    : ((handoffResult.data?.[0] as { created_at?: unknown } | undefined)?.created_at ?? null);

  return {
    facts: {
      releaseDate: release.releaseDate,
      hasSong: !songResult.error && (songResult.count ?? 0) > 0,
      hasCoverArt: Boolean(release.artworkAssetId),
      metadata: row
        ? {
            genre: asText(row.genre),
            language: asText(row.language),
            explicit: typeof row.explicit === 'boolean' ? row.explicit : null,
            labelName: asText(row.label_name),
          }
        : null,
      creditsCount: creditsResult.error ? 0 : (creditsResult.count ?? 0),
    },
    lastHandoffAt: typeof lastHandoff === 'string' ? lastHandoff : null,
  };
}

/**
 * Record that someone on the team opened the partner's sign-up for this
 * rollout. A billing_events row: the type column is free text by design, so this
 * needed no migration, and /admin can read it beside the other moments.
 *
 * One row per tap, not deduped: the founder compares the count with the
 * partner's own statement, and a team that went back is a team worth knowing
 * about. Returns whether it landed; a miss never blocks the tap, which has
 * already opened the partner's page by the time this runs.
 */
export async function recordDistributionHandoff(
  admin: SupabaseClient,
  input: { releaseId: string; ownerUserId: string; actorUserId: string }
): Promise<boolean> {
  let workspaceId: string | null = null;
  try {
    const { data } = await admin
      .from('workspaces')
      .select('id')
      .eq('owner_id', input.ownerUserId)
      .maybeSingle();
    workspaceId = (data as { id?: string } | null)?.id ?? null;
  } catch {
    workspaceId = null;
  }

  return logBillingEvent(admin, {
    workspaceId,
    ownerUserId: input.ownerUserId,
    actorUserId: input.actorUserId,
    type: HANDOFF_EVENT,
    metadata: { releaseId: input.releaseId, partner: 'therealmusicdistro' },
  });
}
