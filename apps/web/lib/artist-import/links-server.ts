import type { SupabaseClient } from '@supabase/supabase-js';
import { AltlinkError, createAltlinkClient, isAltlinkConfigured, type AltlinkClient } from '@/lib/altlink/client';
import { ALTLINK_TIMEZONE, isAltlinkEnabled, isReleasedOn, normalizeIsrc, normalizeUpc, releaseYmd } from '@/lib/altlink/rules';
import { CATALOGUE_TABLE } from './server';
import {
  LINKS_PER_DAY_SETTING_KEY,
  decideLinkCap,
  lagosDayStartIso,
  readLinksPerDay,
  type LinkCapVerdict,
} from './codes';
import { fetchDeezerCodes } from './fetch';
import type { ImportReleaseKind } from './providers';

export const CATALOGUE_LINKS_TABLE = 'catalogue_smart_links';

/** A claim older than this is a crashed attempt, not one in flight. */
const STALE_PENDING_MS = 2 * 60 * 1000;
/** Deezer allows about 50 calls in 5 seconds; stay well under it. */
const LOOKUP_GAP_MS = 150;
const ENRICH_BATCH = 25;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ── Codes ───────────────────────────────────────────────────────────────────

/**
 * Looks up the UPC and ISRC of an artist's imported releases, newest first, a
 * batch at a time. Rows are claimed by stamping codes_checked_at before they
 * are looked at, so two overlapping runs never take the same row. A release
 * Deezer could not be reached for is put back, to be tried on the next run.
 * Returns how many rows are still to look up.
 */
export async function enrichCatalogueCodes(
  admin: SupabaseClient,
  artistId: string,
  options: { sleep?: (ms: number) => Promise<void>; lookup?: typeof fetchDeezerCodes } = {}
): Promise<number> {
  const sleep = options.sleep ?? wait;
  const lookup = options.lookup ?? fetchDeezerCodes;

  const pending = await admin
    .from(CATALOGUE_TABLE)
    .select('id')
    .eq('artist_id', artistId)
    .eq('source', 'deezer')
    .is('codes_checked_at', null)
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(ENRICH_BATCH);
  const ids = ((pending.data ?? []) as { id: string }[]).map((row) => row.id);
  if (ids.length === 0) return 0;

  const claimed = await admin
    .from(CATALOGUE_TABLE)
    .update({ codes_checked_at: new Date().toISOString() })
    .in('id', ids)
    .is('codes_checked_at', null)
    .select('id,source_id,kind');
  const rows = (claimed.data ?? []) as { id: string; source_id: string; kind: ImportReleaseKind }[];

  for (const row of rows) {
    const codes = await lookup(row.source_id, row.kind);
    if (codes === null) {
      await admin.from(CATALOGUE_TABLE).update({ codes_checked_at: null }).eq('id', row.id);
    } else {
      await admin.from(CATALOGUE_TABLE).update({ upc: codes.upc, isrc: codes.isrc }).eq('id', row.id);
    }
    await sleep(LOOKUP_GAP_MS);
  }

  const left = await admin
    .from(CATALOGUE_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('source', 'deezer')
    .is('codes_checked_at', null);
  return left.count ?? 0;
}

// ── The daily cap ───────────────────────────────────────────────────────────

export async function readDailyLimit(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from('app_settings').select('value_json').eq('key', LINKS_PER_DAY_SETTING_KEY).maybeSingle();
  return readLinksPerDay((data as { value_json?: unknown } | null)?.value_json);
}

/** Links made today (Lagos) by a team, plus claims still in flight, so a burst cannot slip past. */
export async function readLinksUsedToday(admin: SupabaseClient, workspaceId: string, nowMs: number = Date.now()): Promise<number> {
  const since = lagosDayStartIso(nowMs);
  const fresh = new Date(nowMs - STALE_PENDING_MS).toISOString();
  const [made, inFlight] = await Promise.all([
    admin
      .from(CATALOGUE_LINKS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'made')
      .gte('created_at', since),
    admin
      .from(CATALOGUE_LINKS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .gte('updated_at', fresh),
  ]);
  return (made.count ?? 0) + (inFlight.count ?? 0);
}

export async function readLinkCap(admin: SupabaseClient, workspaceId: string): Promise<LinkCapVerdict> {
  const [limit, used] = await Promise.all([readDailyLimit(admin), readLinksUsedToday(admin, workspaceId)]);
  return decideLinkCap({ used, limit });
}

// ── Make a link ─────────────────────────────────────────────────────────────

export type MakeLinkOutcome =
  | { kind: 'made'; url: string; cap: LinkCapVerdict }
  | { kind: 'exists'; url: string | null }
  | { kind: 'cap'; cap: LinkCapVerdict }
  | { kind: 'no_code' }
  | { kind: 'busy' }
  | { kind: 'unavailable' }
  | { kind: 'rate_limited' }
  | { kind: 'failed' }
  | { kind: 'not_found' };

type CatalogueRow = {
  id: string;
  workspace_id: string;
  artist_id: string;
  title: string;
  release_date: string | null;
  cover_url: string | null;
  upc: string | null;
  isrc: string | null;
};

/**
 * One Altlink link for one imported release, after the person has confirmed.
 * Order matters: ownership, an existing link, a code, the daily cap, then a
 * claim row (unique per release) BEFORE Altlink is called, so a double tap
 * makes one link. Only links that were made count toward the cap.
 */
export async function makeCatalogueLink(
  admin: SupabaseClient,
  input: { releaseRowId: string; workspaceIds: string[]; userId: string; userEmail: string | null; client?: AltlinkClient; nowMs?: number }
): Promise<MakeLinkOutcome> {
  const nowMs = input.nowMs ?? Date.now();
  const rowResult = await admin
    .from(CATALOGUE_TABLE)
    .select('id,workspace_id,artist_id,title,release_date,cover_url,upc,isrc')
    .eq('id', input.releaseRowId)
    .maybeSingle();
  const row = rowResult.data as CatalogueRow | null;
  if (!row || !input.workspaceIds.includes(row.workspace_id)) return { kind: 'not_found' };

  const existing = await admin
    .from(CATALOGUE_LINKS_TABLE)
    .select('id,status,url,updated_at')
    .eq('catalogue_release_id', row.id)
    .maybeSingle();
  const prior = existing.data as { id: string; status: string; url: string | null; updated_at: string } | null;
  if (prior?.status === 'made') return { kind: 'exists', url: prior.url };
  if (prior?.status === 'pending' && nowMs - Date.parse(prior.updated_at) < STALE_PENDING_MS) return { kind: 'busy' };

  const upc = normalizeUpc(row.upc);
  const isrc = normalizeIsrc(row.isrc);
  if (!upc && !isrc) return { kind: 'no_code' };

  if (!isAltlinkEnabled() || (!input.client && !isAltlinkConfigured())) return { kind: 'unavailable' };

  const cap = await readLinkCap(admin, row.workspace_id);
  if (!cap.allowed) return { kind: 'cap', cap };

  let claimId: string;
  if (prior) {
    const taken = await admin
      .from(CATALOGUE_LINKS_TABLE)
      .update({ status: 'pending', last_error: null, created_by: input.userId })
      .eq('id', prior.id)
      .eq('updated_at', prior.updated_at)
      .select('id')
      .maybeSingle();
    if (!taken.data) return { kind: 'busy' };
    claimId = (taken.data as { id: string }).id;
  } else {
    const inserted = await admin
      .from(CATALOGUE_LINKS_TABLE)
      .insert({ catalogue_release_id: row.id, workspace_id: row.workspace_id, status: 'pending', created_by: input.userId })
      .select('id')
      .maybeSingle();
    if (inserted.error) {
      if (inserted.error.code === '23505') return { kind: 'busy' };
      throw new Error(inserted.error.message);
    }
    claimId = (inserted.data as { id: string }).id;
  }

  try {
    const artist = await admin.from('artists').select('name').eq('id', row.artist_id).maybeSingle();
    const client = input.client ?? createAltlinkClient();
    const link = await client.createLink({
      title: row.title,
      artist_name: String((artist.data as { name?: string } | null)?.name ?? ''),
      external_release_id: `catalogue:${row.id}`,
      ...(upc ? { upc } : {}),
      ...(isrc ? { isrc } : {}),
      // A date is sent only for a release still to come (a pre-save). Past and
      // today's releases are plain smart links with no date: Altlink answers a
      // past date with invalid_request (BUILD-NOTES-ALTLINK.md, the same rule
      // decideCreate follows). Found 2026-10-26 on the first real tap.
      ...(row.release_date && !isReleasedOn(row.release_date, nowMs) ? { release_date: releaseYmd(row.release_date) as string } : {}),
      ...(row.cover_url ? { artwork_url: row.cover_url } : {}),
      ...(input.userEmail ? { creator_email: input.userEmail } : {}),
      timezone: ALTLINK_TIMEZONE,
    });
    if (!link.url) throw new AltlinkError(502, 'bad_response', 'Altlink sent back no link address.');
    await admin
      .from(CATALOGUE_LINKS_TABLE)
      .update({ status: 'made', altlink_link_id: link.id, slug: link.slug, url: link.url, last_error: null })
      .eq('id', claimId);
    return { kind: 'made', url: link.url, cap: decideLinkCap({ used: cap.used + 1, limit: cap.limit }) };
  } catch (error) {
    const code = error instanceof AltlinkError ? error.code : 'error';
    // Altlink's own sentence is kept with the code, so a failed row says why.
    const detail = error instanceof AltlinkError ? `${error.code}: ${error.message}`.slice(0, 300) : 'error';
    console.error('[catalogue-link] create failed', { releaseRowId: row.id, code, status: error instanceof AltlinkError ? error.status : 0, message: error instanceof Error ? error.message : '' });
    if (error instanceof AltlinkError && error.status === 422 && error.code === 'missing_identifier') {
      await admin.from(CATALOGUE_LINKS_TABLE).delete().eq('id', claimId).eq('status', 'pending');
      return { kind: 'no_code' };
    }
    if (error instanceof AltlinkError && error.status === 429) {
      await admin.from(CATALOGUE_LINKS_TABLE).delete().eq('id', claimId).eq('status', 'pending');
      return { kind: 'rate_limited' };
    }
    await admin.from(CATALOGUE_LINKS_TABLE).update({ status: 'failed', last_error: detail }).eq('id', claimId);
    return { kind: 'failed' };
  }
}
