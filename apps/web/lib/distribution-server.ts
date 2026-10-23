// Distribution: the reads, the check, and the two writes. Server only. The rules
// are lib/distribution-rules.ts and the copy lives with them; this file fetches
// the facts those rules need, runs them, and records what the team and the
// distributor did.
//
// THE CHECK GATES AN ORDER NOW, so the reads FAIL CLOSED. Before the check
// existed this page gated nothing, and a read that failed answered "not there",
// which only made a checklist ask for the thing again. A check that quietly
// passes because a read failed would let a broken rollout through, so any read
// that errors makes checkReleaseForDistribution answer null, and the route
// treats null as "could not check", never as "all clear".

import type { SupabaseClient } from '@supabase/supabase-js';
import { logBillingEvent } from './billing-events-server';
import {
  checkDistributionFacts,
  type DistributionCheckResult,
  type DistributionFacts,
} from './distribution-rules';

const HANDOFF_EVENT = 'distribution_handoff' as const;
const PARTNER_KEY = 'therealmusicdistro';

/** How many of the distributor's answers the rollout shows. Newest first. */
const REJECTIONS_SHOWN = 5;

export type DistributionRejection = {
  id: string;
  partner: string;
  reasonCode: string | null;
  reasonText: string | null;
  createdAt: string;
};

export type DistributionPayload = DistributionCheckResult & {
  /** What the distributor sent back, newest first. Empty when nothing has been. */
  rejections: DistributionRejection[];
  /** When this rollout's team last opened the partner's sign-up, or null. */
  lastHandoffAt: string | null;
};

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** The pixel size the browser measured before uploading, kept in
 *  assets.metadata.image since 2026-08-22. Anything else reads as unknown. */
function readImageSize(metadata: unknown): { width: number | null; height: number | null } {
  const image =
    metadata && typeof metadata === 'object'
      ? (metadata as { image?: unknown }).image
      : null;
  if (!image || typeof image !== 'object') return { width: null, height: null };
  const { width, height } = image as { width?: unknown; height?: unknown };
  return { width: asNumber(width), height: asNumber(height) };
}

/**
 * Read everything the rules need about one rollout. Null when the rollout is
 * not there or ANY read failed (see the note at the top of this file).
 */
export async function loadDistributionFacts(
  admin: SupabaseClient,
  releaseId: string
): Promise<DistributionFacts | null> {
  const [releaseResult, metadataResult, creditsResult] = await Promise.all([
    admin
      .from('releases')
      .select('title,artist_name,release_date,artwork_asset_id')
      .eq('id', releaseId)
      .is('deleted_at', null)
      .maybeSingle(),
    admin
      .from('release_metadata')
      .select('genre,language,explicit')
      .eq('release_id', releaseId)
      .maybeSingle(),
    admin
      .from('release_credit_submissions')
      .select('roles,songwriter_split,master_split')
      .eq('release_id', releaseId),
  ]);

  if (releaseResult.error || metadataResult.error || creditsResult.error) {
    return null;
  }
  const release = releaseResult.data as Record<string, unknown> | null;
  if (!release) return null;

  // The artwork row is a second read, and only exists when the pointer is set.
  let artwork: DistributionFacts['artwork'] = null;
  const artworkAssetId = asText(release.artwork_asset_id);
  if (artworkAssetId) {
    const artworkResult = await admin
      .from('assets')
      .select('mime_type,metadata')
      .eq('id', artworkAssetId)
      .maybeSingle();
    if (artworkResult.error) return null;
    const row = artworkResult.data as Record<string, unknown> | null;
    // A pointer to a row that is gone reads as no artwork at all.
    if (row) {
      const size = readImageSize(row.metadata);
      artwork = { mimeType: asText(row.mime_type), width: size.width, height: size.height };
    }
  }

  const metadata = (metadataResult.data as Record<string, unknown> | null) ?? null;

  return {
    title: typeof release.title === 'string' ? release.title : '',
    primaryArtist: typeof release.artist_name === 'string' ? release.artist_name : '',
    releaseDate: asText(release.release_date),
    genre: asText(metadata?.genre),
    language: asText(metadata?.language),
    explicit: typeof metadata?.explicit === 'boolean' ? metadata.explicit : null,
    artwork,
    credits: ((creditsResult.data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
      roles: Array.isArray(row.roles) ? row.roles.filter((role): role is string => typeof role === 'string') : [],
      songwriterSplit: asNumber(row.songwriter_split),
      masterSplit: asNumber(row.master_split),
    })),
  };
}

/**
 * THE CHECK. One server-side function, used by the Distribute scene, the status
 * on the rollout and the order route, so a rollout can never read differently in
 * two places and the route never has to trust what the browser says.
 *
 * Null means the rollout could not be read, which is not the same as "nothing
 * wrong": the caller must refuse to proceed on it.
 */
export async function checkReleaseForDistribution(
  admin: SupabaseClient,
  releaseId: string,
  now: Date = new Date()
): Promise<DistributionCheckResult | null> {
  const facts = await loadDistributionFacts(admin, releaseId);
  if (!facts) return null;
  return checkDistributionFacts(facts, { today: now });
}

/** What the distributor has sent back for this rollout. A read that fails
 *  answers "none": this is shown beside the check, never used to decide it. */
export async function loadRejections(
  admin: SupabaseClient,
  releaseId: string
): Promise<DistributionRejection[]> {
  const { data, error } = await admin
    .from('distribution_rejections')
    .select('id,partner,reason_code,reason_text,created_at')
    .eq('release_id', releaseId)
    .order('created_at', { ascending: false })
    .limit(REJECTIONS_SHOWN);
  if (error) return [];
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    id: String(row.id ?? ''),
    partner: asText(row.partner) ?? PARTNER_KEY,
    reasonCode: asText(row.reason_code),
    reasonText: asText(row.reason_text),
    createdAt: asText(row.created_at) ?? '',
  }));
}

async function loadLastHandoff(admin: SupabaseClient, releaseId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('billing_events')
    .select('created_at')
    .eq('type', HANDOFF_EVENT)
    .eq('metadata->>releaseId', releaseId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return null;
  const at = (data?.[0] as { created_at?: unknown } | undefined)?.created_at;
  return typeof at === 'string' ? at : null;
}

/** Everything the Distribute scene and the rollout's status show, in one read.
 *  Null when the check itself could not run. */
export async function loadDistributionPayload(
  admin: SupabaseClient,
  releaseId: string,
  now: Date = new Date()
): Promise<DistributionPayload | null> {
  const [check, rejections, lastHandoffAt] = await Promise.all([
    checkReleaseForDistribution(admin, releaseId, now),
    loadRejections(admin, releaseId),
    loadLastHandoff(admin, releaseId),
  ]);
  if (!check) return null;
  return { ...check, rejections, lastHandoffAt };
}

export async function workspaceIdOf(admin: SupabaseClient, ownerUserId: string): Promise<string | null> {
  try {
    const { data } = await admin.from('workspaces').select('id').eq('owner_id', ownerUserId).maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Record that someone on the team opened the partner's sign-up for this
 * rollout. A billing_events row: the type column is free text by design, so this
 * needed no migration, and /admin can read it beside the other moments.
 *
 * One row per tap, not deduped: the founder compares the count with the
 * partner's own statement, and a team that went back is a team worth knowing
 * about. `acknowledgedWarnings` lists the codes of any warnings the person
 * ordered past, so "went anyway" is a thing the founder can count.
 *
 * Returns whether it landed; a miss never blocks the tap, which has already
 * opened the partner's page by the time this runs.
 */
export async function recordDistributionHandoff(
  admin: SupabaseClient,
  input: {
    releaseId: string;
    ownerUserId: string;
    actorUserId: string;
    acknowledgedWarnings?: readonly string[];
  }
): Promise<boolean> {
  const workspaceId = await workspaceIdOf(admin, input.ownerUserId);
  return logBillingEvent(admin, {
    workspaceId,
    ownerUserId: input.ownerUserId,
    actorUserId: input.actorUserId,
    type: HANDOFF_EVENT,
    metadata: {
      releaseId: input.releaseId,
      partner: PARTNER_KEY,
      ...(input.acknowledgedWarnings && input.acknowledgedWarnings.length > 0
        ? { acknowledgedWarnings: [...input.acknowledgedWarnings] }
        : {}),
    },
  });
}

/**
 * Keep what the distributor sent back. The partner's API does not exist yet, so
 * nothing calls this today; it is built so the day it does, a rejection lands
 * with its reason and the payload it came from, whole. If the API gives no
 * reason, pass whatever the status payload held as `raw` and leave the two
 * reason fields empty.
 *
 * Never throws. Returns the new row's id, or null when it could not be written.
 */
export async function recordDistributionRejection(
  admin: SupabaseClient,
  input: {
    releaseId: string;
    ownerUserId: string;
    reasonCode?: string | null;
    reasonText?: string | null;
    raw?: unknown;
    partner?: string;
  }
): Promise<string | null> {
  try {
    const workspaceId = await workspaceIdOf(admin, input.ownerUserId);
    const { data, error } = await admin
      .from('distribution_rejections')
      .insert({
        release_id: input.releaseId,
        workspace_id: workspaceId,
        partner: input.partner?.trim() || PARTNER_KEY,
        reason_code: input.reasonCode?.trim().slice(0, 120) || null,
        reason_text: input.reasonText?.trim().slice(0, 2000) || null,
        raw: input.raw !== undefined && input.raw !== null ? input.raw : {},
      })
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[distribution] could not store a rejection', error.message);
      return null;
    }
    return (data as { id?: string } | null)?.id ?? null;
  } catch (error) {
    console.error('[distribution] could not store a rejection', error);
    return null;
  }
}
