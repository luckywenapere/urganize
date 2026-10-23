// Altlink pre-save / smart link: the database half. Server only.
//
// ONE entry point makes or updates a link, `syncSmartLink`, and every trigger
// calls it: the Metadata save, the TRM webhook delivering codes, a cover art
// change, opening the view, and the admin backfill. So the rules for when a link
// is made (lib/altlink/rules.ts decideCreate) live in exactly one place.

import type { SupabaseClient } from '@supabase/supabase-js';
import { RELEASE_ASSETS_BUCKET, generateSignedUrl } from '@/lib/asset-helpers';
import { readTestRelease } from '@/lib/test-release';
import { AltlinkError, createAltlinkClient, isAltlinkConfigured, isNotReady, type AltlinkClient } from './client';
import {
  ALTLINK_TIMEZONE,
  decideCreate,
  mapLinkStatus,
  normalizeIsrc,
  normalizeUpc,
  readStats,
  releaseYmd,
  statsAreFresh,
  type AltlinkEvent,
  type AltlinkLink,
  type CreateDecision,
  type SmartLinkFacts,
  type SmartLinkPlatform,
  type SmartLinkStats,
} from './rules';

export const SMART_LINKS_TABLE = 'release_smart_links';
export const ALTLINK_EVENTS_TABLE = 'altlink_webhook_events';

const ROW_COLUMNS =
  'id,release_id,altlink_link_id,slug,url,claim_url,type,status,release_date,platforms,stats,stats_fetched_at,presave_signups,last_error,sent_upc,sent_isrc,sent_artwork_asset_id,created_by,created_at,updated_at';

/** A 'pending' claim older than this is a crashed attempt, not one in flight. */
const STALE_PENDING_MS = 2 * 60 * 1000;
/** Altlink fetches the cover once; a long-lived signed URL keeps it reachable. */
const ARTWORK_URL_TTL_SECONDS = 30 * 24 * 60 * 60;

export type SmartLinkRow = {
  id: string;
  release_id: string;
  altlink_link_id: string | null;
  slug: string | null;
  url: string | null;
  claim_url: string | null;
  type: string | null;
  status: 'pending' | 'scheduled' | 'live' | 'converted' | 'failed';
  release_date: string | null;
  platforms: unknown;
  stats: unknown;
  stats_fetched_at: string | null;
  presave_signups: number;
  last_error: string | null;
  sent_upc: string | null;
  sent_isrc: string | null;
  sent_artwork_asset_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SmartLinkSourceFacts = SmartLinkFacts & {
  releaseId: string;
  ownerUserId: string | null;
  artworkAssetId: string | null;
  releaseType: string | null;
  /** Where the code came from, for the facts card. */
  codeSource: 'details' | 'trm' | null;
  artistEmail: string | null;
};

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Everything a link is made from, read server-side (never from the browser). */
export async function loadSmartLinkFacts(
  admin: SupabaseClient,
  releaseId: string
): Promise<SmartLinkSourceFacts | null> {
  const [releaseRes, metadataRes, trmRes] = await Promise.all([
    admin
      .from('releases')
      .select('id,title,artist_name,release_date,owner_user_id,artwork_asset_id,metadata,archived_at,status,release_type')
      .eq('id', releaseId)
      .is('deleted_at', null)
      .maybeSingle(),
    admin.from('release_metadata').select('upc,isrc').eq('release_id', releaseId).maybeSingle(),
    admin
      .from('distribution_submissions')
      .select('upc,isrc,artist_email')
      .eq('release_id', releaseId)
      .eq('partner', 'trm')
      .maybeSingle(),
  ]);
  if (releaseRes.error) throw new Error(releaseRes.error.message);
  const release = releaseRes.data as Record<string, unknown> | null;
  if (!release) return null;
  const metadata = (metadataRes.data ?? {}) as Record<string, unknown>;
  const trm = (trmRes.data ?? {}) as Record<string, unknown>;

  const detailsUpc = normalizeUpc(metadata.upc);
  const detailsIsrc = normalizeIsrc(metadata.isrc);
  const trmUpc = normalizeUpc(trm.upc);
  const trmIsrc = normalizeIsrc(trm.isrc);
  const upc = detailsUpc ?? trmUpc;
  const isrc = detailsIsrc ?? trmIsrc;
  const codeSource = detailsUpc || detailsIsrc ? 'details' : trmUpc || trmIsrc ? 'trm' : null;

  return {
    releaseId,
    title: text(release.title),
    artistName: text(release.artist_name),
    releaseDate: releaseYmd(text(release.release_date)),
    upc,
    isrc,
    isTest: readTestRelease((release.metadata ?? {}) as Parameters<typeof readTestRelease>[0]),
    isArchived: Boolean(release.archived_at) || release.status === 'archived',
    ownerUserId: text(release.owner_user_id),
    artworkAssetId: text(release.artwork_asset_id),
    releaseType: text(release.release_type),
    codeSource,
    artistEmail: text(trm.artist_email),
  };
}

export async function loadSmartLinkRow(admin: SupabaseClient, releaseId: string): Promise<SmartLinkRow | null> {
  const { data, error } = await admin.from(SMART_LINKS_TABLE).select(ROW_COLUMNS).eq('release_id', releaseId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SmartLinkRow | null) ?? null;
}

/** The artist's email from the TRM submission when we hold one, else the owner's. */
async function creatorEmail(admin: SupabaseClient, facts: SmartLinkSourceFacts): Promise<string | null> {
  if (facts.artistEmail && facts.artistEmail.includes('@')) return facts.artistEmail;
  if (!facts.ownerUserId) return null;
  const { data } = await admin.from('profiles').select('email').eq('id', facts.ownerUserId).maybeSingle();
  const email = text((data as Record<string, unknown> | null)?.email);
  return email && email.includes('@') ? email : null;
}

async function artworkUrl(admin: SupabaseClient, assetId: string | null): Promise<string | null> {
  if (!assetId) return null;
  const { data } = await admin.from('assets').select('storage_bucket,storage_path').eq('id', assetId).maybeSingle();
  const row = data as Record<string, unknown> | null;
  const path = text(row?.storage_path);
  if (!path) return null;
  const url = await generateSignedUrl(admin, text(row?.storage_bucket) ?? RELEASE_ASSETS_BUCKET, path, ARTWORK_URL_TTL_SECONDS);
  return url && url.startsWith('https://') ? url : null;
}

async function stamp(admin: SupabaseClient, releaseId: string, type: string, payload: Record<string, unknown>) {
  const { error } = await admin.from('release_events').insert({ release_id: releaseId, type, payload_json: payload });
  if (error) console.error(`[altlink] could not stamp ${type}`, error.message);
}

function linkFields(link: AltlinkLink) {
  return {
    altlink_link_id: link.id,
    slug: link.slug,
    url: link.url,
    claim_url: link.claimUrl,
    type: link.type === 'smart_link' || link.type === 'pre_save' ? link.type : null,
    status: mapLinkStatus(link.status),
    release_date: releaseYmd(link.releaseDate),
    ...(link.platforms.length ? { platforms: link.platforms } : {}),
    last_error: null,
  };
}

export type SyncOutcome =
  | { kind: 'disabled' }
  | { kind: 'not_ready'; reason: string }
  | { kind: 'busy' }
  | { kind: 'created'; row: SmartLinkRow }
  | { kind: 'patched'; row: SmartLinkRow }
  | { kind: 'unchanged'; row: SmartLinkRow }
  | { kind: 'failed'; row: SmartLinkRow | null; code: string };

export type SyncOptions = {
  actorUserId?: string | null;
  client?: AltlinkClient;
  now?: number;
  /** The view's Try again: retry a failed link even if nothing changed. */
  retry?: boolean;
};

function isStalePending(row: SmartLinkRow, now: number): boolean {
  const at = Date.parse(row.updated_at);
  return row.status === 'pending' && (!Number.isFinite(at) || now - at > STALE_PENDING_MS);
}

/**
 * Make the rollout's link if it is ready and has none; patch the ISRC or cover
 * art when they changed after it was made. Idempotent: the unique release_id is
 * claimed with a 'pending' row BEFORE Altlink is called, so two saves at once
 * make one link; Altlink also dedupes on external_release_id.
 */
export async function syncSmartLink(
  admin: SupabaseClient,
  releaseId: string,
  options: SyncOptions = {}
): Promise<SyncOutcome> {
  const enabled = process.env.NEXT_PUBLIC_FEATURE_ALTLINK !== 'false';
  if (!enabled || (!options.client && !isAltlinkConfigured())) return { kind: 'disabled' };
  const now = options.now ?? Date.now();
  const client = options.client ?? createAltlinkClient();

  const facts = await loadSmartLinkFacts(admin, releaseId);
  if (!facts) return { kind: 'not_ready', reason: 'no_release' };
  const existing = await loadSmartLinkRow(admin, releaseId);

  if (existing && existing.altlink_link_id && existing.status !== 'failed' && existing.status !== 'pending') {
    return patchIfChanged(admin, client, existing, facts);
  }
  if (existing && existing.status === 'pending' && !isStalePending(existing, now)) return { kind: 'busy' };

  const decision: CreateDecision = decideCreate(facts, now);
  if (!decision.ready) return { kind: 'not_ready', reason: decision.reason };

  // Claim. A new row, or take over a failed / stale one with a conditional update.
  let claimed: SmartLinkRow | null = null;
  if (!existing) {
    const insert = await admin
      .from(SMART_LINKS_TABLE)
      .insert({ release_id: releaseId, status: 'pending', created_by: options.actorUserId ?? null })
      .select(ROW_COLUMNS)
      .maybeSingle();
    if (insert.error) {
      if (insert.error.code === '23505') return { kind: 'busy' };
      throw new Error(insert.error.message);
    }
    claimed = insert.data as SmartLinkRow;
  } else {
    if (existing.status === 'failed' && !options.retry) {
      // A failed link is retried by Try again, or when a trigger brings new facts.
      const changed =
        normalizeIsrc(existing.sent_isrc) !== facts.isrc ||
        normalizeUpc(existing.sent_upc) !== facts.upc ||
        existing.sent_artwork_asset_id !== facts.artworkAssetId;
      if (!changed) return { kind: 'failed', row: existing, code: existing.last_error ?? 'failed' };
    }
    const update = await admin
      .from(SMART_LINKS_TABLE)
      .update({ status: 'pending', last_error: null })
      .eq('id', existing.id)
      .eq('status', existing.status)
      .eq('updated_at', existing.updated_at)
      .select(ROW_COLUMNS)
      .maybeSingle();
    if (update.error) throw new Error(update.error.message);
    if (!update.data) return { kind: 'busy' };
    claimed = update.data as SmartLinkRow;
  }

  const sent = { sent_upc: facts.upc, sent_isrc: facts.isrc, sent_artwork_asset_id: facts.artworkAssetId };
  try {
    const [email, artwork] = await Promise.all([creatorEmail(admin, facts), artworkUrl(admin, facts.artworkAssetId)]);
    const link = await client.createLink({
      title: facts.title as string,
      artist_name: facts.artistName as string,
      external_release_id: releaseId,
      ...(facts.upc ? { upc: facts.upc } : {}),
      ...(facts.isrc ? { isrc: facts.isrc } : {}),
      ...(decision.releaseDate ? { release_date: decision.releaseDate } : {}),
      ...(artwork ? { artwork_url: artwork } : {}),
      ...(email ? { creator_email: email } : {}),
      timezone: ALTLINK_TIMEZONE,
    });
    const saved = await admin
      .from(SMART_LINKS_TABLE)
      .update({ ...linkFields(link), type: link.type ?? decision.type, ...sent, ...(artwork ? {} : { sent_artwork_asset_id: null }) })
      .eq('id', claimed.id)
      .select(ROW_COLUMNS)
      .maybeSingle();
    if (saved.error) throw new Error(saved.error.message);
    await stamp(admin, releaseId, 'smart_link_created', { linkId: link.id, url: link.url, type: link.type ?? decision.type });
    return { kind: 'created', row: saved.data as SmartLinkRow };
  } catch (error) {
    if (isNotReady(error)) {
      await admin.from(SMART_LINKS_TABLE).delete().eq('id', claimed.id).eq('status', 'pending');
      return { kind: 'not_ready', reason: 'missing_identifier' };
    }
    const code = error instanceof AltlinkError ? error.code : 'error';
    console.error('[altlink] create failed', { releaseId, code });
    const failed = await admin
      .from(SMART_LINKS_TABLE)
      .update({ status: 'failed', last_error: code, ...sent })
      .eq('id', claimed.id)
      .select(ROW_COLUMNS)
      .maybeSingle();
    return { kind: 'failed', row: (failed.data as SmartLinkRow | null) ?? null, code };
  }
}

/** Silent PATCH: a new ISRC, or a different cover. Never shown as an error. */
async function patchIfChanged(
  admin: SupabaseClient,
  client: AltlinkClient,
  row: SmartLinkRow,
  facts: SmartLinkSourceFacts
): Promise<SyncOutcome> {
  const patch: { isrc?: string; artwork_url?: string } = {};
  const isrcChanged = Boolean(facts.isrc) && facts.isrc !== normalizeIsrc(row.sent_isrc);
  if (isrcChanged && facts.isrc) patch.isrc = facts.isrc;
  const artworkChanged = Boolean(facts.artworkAssetId) && facts.artworkAssetId !== row.sent_artwork_asset_id;
  if (artworkChanged) {
    const url = await artworkUrl(admin, facts.artworkAssetId);
    if (url) patch.artwork_url = url;
  }
  if (!patch.isrc && !patch.artwork_url) return { kind: 'unchanged', row };
  try {
    await client.patchLink(row.altlink_link_id as string, patch);
  } catch (error) {
    console.error('[altlink] patch failed', { releaseId: row.release_id, code: error instanceof AltlinkError ? error.code : 'error' });
    return { kind: 'unchanged', row };
  }
  const saved = await admin
    .from(SMART_LINKS_TABLE)
    .update({
      ...(patch.isrc ? { sent_isrc: patch.isrc } : {}),
      ...(patch.artwork_url ? { sent_artwork_asset_id: facts.artworkAssetId } : {}),
    })
    .eq('id', row.id)
    .select(ROW_COLUMNS)
    .maybeSingle();
  return { kind: 'patched', row: (saved.data as SmartLinkRow | null) ?? row };
}

/** Never throws: a trigger must not fail the save that called it. */
export async function syncSmartLinkQuietly(admin: SupabaseClient, releaseId: string, actorUserId?: string | null) {
  try {
    return await syncSmartLink(admin, releaseId, { actorUserId });
  } catch (error) {
    console.error('[altlink] sync failed', { releaseId, message: error instanceof Error ? error.message : 'error' });
    return null;
  }
}

// ── The view ────────────────────────────────────────────────────────────────

export type SmartLinkView = {
  enabled: boolean;
  configured: boolean;
  link: {
    url: string | null;
    slug: string | null;
    type: string | null;
    status: SmartLinkRow['status'];
    releaseDate: string | null;
    platforms: SmartLinkPlatform[];
    lastError: string | null;
    presaveSignups: number;
  } | null;
  stats: SmartLinkStats | null;
  statsFetchedAt: string | null;
  facts: {
    title: string | null;
    artistName: string | null;
    releaseType: string | null;
    releaseDate: string | null;
    upc: string | null;
    isrc: string | null;
    codeSource: 'details' | 'trm' | null;
  };
  /** Why there is no link yet, when there is none. */
  notReady: string | null;
};

function readPlatformRows(value: unknown): SmartLinkPlatform[] {
  return Array.isArray(value) ? (value as SmartLinkPlatform[]).filter((p) => p && typeof p.id === 'string') : [];
}

/** Stats cached 10 minutes per link; a failed fetch keeps the last numbers. */
async function freshStats(
  admin: SupabaseClient,
  client: AltlinkClient,
  row: SmartLinkRow,
  now: number
): Promise<{ stats: SmartLinkStats | null; fetchedAt: string | null }> {
  const cached = readStats(row.stats);
  if (!row.altlink_link_id || statsAreFresh(row.stats_fetched_at, now)) return { stats: cached, fetchedAt: row.stats_fetched_at };
  try {
    const stats = await client.getStats(row.altlink_link_id);
    if (!stats) return { stats: cached, fetchedAt: row.stats_fetched_at };
    const fetchedAt = new Date(now).toISOString();
    const raw = {
      views: stats.views,
      clicks: stats.clicks,
      ctr: stats.ctr,
      presaves: stats.presaves,
      top_platforms: stats.topPlatforms,
    };
    await admin.from(SMART_LINKS_TABLE).update({ stats: raw, stats_fetched_at: fetchedAt }).eq('id', row.id);
    return { stats, fetchedAt };
  } catch (error) {
    console.error('[altlink] stats failed', { releaseId: row.release_id, code: error instanceof AltlinkError ? error.code : 'error' });
    return { stats: cached, fetchedAt: row.stats_fetched_at };
  }
}

export async function loadSmartLinkView(
  admin: SupabaseClient,
  releaseId: string,
  options: { actorUserId?: string | null; client?: AltlinkClient; now?: number; readOnly?: boolean } = {}
): Promise<SmartLinkView> {
  const now = options.now ?? Date.now();
  const enabled = process.env.NEXT_PUBLIC_FEATURE_ALTLINK !== 'false';
  const configured = Boolean(options.client) || isAltlinkConfigured();
  let notReady: string | null = null;

  // Opening the view is a trigger too: it catches a code that arrived any way
  // we did not hook, or a date that just moved into place.
  if (enabled && configured && !options.readOnly) {
    const outcome = await syncSmartLink(admin, releaseId, { actorUserId: options.actorUserId, client: options.client, now });
    if (outcome.kind === 'not_ready') notReady = outcome.reason;
  }

  const [facts, row] = await Promise.all([loadSmartLinkFacts(admin, releaseId), loadSmartLinkRow(admin, releaseId)]);
  let stats: SmartLinkStats | null = null;
  let statsFetchedAt: string | null = null;
  if (row && row.url && configured) {
    const fresh = await freshStats(admin, options.client ?? createAltlinkClient(), row, now);
    stats = fresh.stats;
    statsFetchedAt = fresh.fetchedAt;
  }
  if (stats && row) stats = { ...stats, presaves: Math.max(stats.presaves, row.presave_signups) };
  if (!facts) notReady = 'no_release';
  else if (!row && !notReady) {
    const decision = decideCreate(facts, now);
    notReady = decision.ready ? null : decision.reason;
  }

  return {
    enabled,
    configured,
    link: row
      ? {
          url: row.url,
          slug: row.slug,
          type: row.type,
          status: row.status,
          releaseDate: row.release_date,
          platforms: readPlatformRows(row.platforms),
          lastError: row.last_error,
          presaveSignups: row.presave_signups,
        }
      : null,
    stats,
    statsFetchedAt,
    facts: {
      title: facts?.title ?? null,
      artistName: facts?.artistName ?? null,
      releaseType: facts?.releaseType ?? null,
      releaseDate: facts?.releaseDate ?? null,
      upc: facts?.upc ?? null,
      isrc: facts?.isrc ?? null,
      codeSource: facts?.codeSource ?? null,
    },
    notReady,
  };
}

/** The live link for a rollout, for the old /capture/<token> page. */
export async function loadLiveSmartLinkUrl(admin: SupabaseClient, releaseId: string): Promise<string | null> {
  try {
    const row = await loadSmartLinkRow(admin, releaseId);
    if (!row || !row.url || row.status === 'failed' || row.status === 'pending') return null;
    return /^https:\/\//i.test(row.url) ? row.url : null;
  } catch {
    return null;
  }
}

// ── Webhook ─────────────────────────────────────────────────────────────────

export type WebhookApplyOutcome = 'applied' | 'duplicate' | 'no_link' | 'ignored' | 'error';

/**
 * Apply one verified delivery. The event row is written FIRST and its primary
 * key is the dedupe; if applying fails the event row is removed so Altlink's
 * retry is processed again.
 */
export async function applyAltlinkWebhook(admin: SupabaseClient, event: AltlinkEvent): Promise<WebhookApplyOutcome> {
  const insert = await admin.from(ALTLINK_EVENTS_TABLE).insert({ event_id: event.eventId, type: event.type });
  if (insert.error) {
    if (insert.error.code === '23505') return 'duplicate';
    console.error('[altlink] could not store an event', insert.error.message);
    return 'error';
  }
  try {
    const outcome = await applyEvent(admin, event);
    return outcome;
  } catch (error) {
    console.error('[altlink] could not apply an event', { type: event.type, message: error instanceof Error ? error.message : 'error' });
    await admin.from(ALTLINK_EVENTS_TABLE).delete().eq('event_id', event.eventId);
    return 'error';
  }
}

async function findRow(admin: SupabaseClient, event: AltlinkEvent): Promise<SmartLinkRow | null> {
  if (event.linkId) {
    const { data, error } = await admin.from(SMART_LINKS_TABLE).select(ROW_COLUMNS).eq('altlink_link_id', event.linkId).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as SmartLinkRow;
  }
  if (event.externalReleaseId && /^[0-9a-f-]{36}$/i.test(event.externalReleaseId)) {
    return loadSmartLinkRow(admin, event.externalReleaseId);
  }
  return null;
}

async function applyEvent(admin: SupabaseClient, event: AltlinkEvent): Promise<WebhookApplyOutcome> {
  const row = await findRow(admin, event);
  if (!row) return 'no_link';
  const update = (fields: Record<string, unknown>) =>
    admin.from(SMART_LINKS_TABLE).update(fields).eq('id', row.id).then(({ error }) => {
      if (error) throw new Error(error.message);
    });

  switch (event.type) {
    case 'link.created': {
      if (event.link && !row.url) await update(linkFields(event.link));
      return 'applied';
    }
    case 'link.platforms_updated': {
      if (event.platforms) await update({ platforms: event.platforms });
      return 'applied';
    }
    case 'link.converted': {
      if (row.status !== 'converted') {
        await update({ status: 'converted', ...(event.platforms ? { platforms: event.platforms } : {}) });
        await stamp(admin, row.release_id, 'smart_link_converted', { linkId: row.altlink_link_id, url: row.url });
      }
      return 'applied';
    }
    case 'presave.signup': {
      // Only the cached count moves. No fan details are stored here.
      const { error } = await admin
        .from(SMART_LINKS_TABLE)
        .update({ presave_signups: (row.presave_signups ?? 0) + 1 })
        .eq('id', row.id)
        .eq('presave_signups', row.presave_signups ?? 0);
      if (error) throw new Error(error.message);
      return 'applied';
    }
    default:
      return 'ignored';
  }
}

// ── Backfill ────────────────────────────────────────────────────────────────

export type BackfillReport = {
  dryRun: boolean;
  candidates: number;
  ready: number;
  created: number;
  notReady: Record<string, number>;
  failed: number;
};

/** About 100 calls a minute, under Altlink's 120. */
const BACKFILL_GAP_MS = 600;

/**
 * Every rollout that already has a code and no link. Dry run by default: it
 * reports what it would do and calls nothing.
 */
export async function backfillSmartLinks(
  admin: SupabaseClient,
  options: { dryRun: boolean; limit?: number; client?: AltlinkClient; now?: number; sleep?: (ms: number) => Promise<void> }
): Promise<BackfillReport> {
  const now = options.now ?? Date.now();
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const [metaRes, trmRes, linkRes] = await Promise.all([
    admin.from('release_metadata').select('release_id,upc,isrc').or('upc.not.is.null,isrc.not.is.null').limit(2000),
    admin.from('distribution_submissions').select('release_id,upc,isrc').eq('partner', 'trm').or('upc.not.is.null,isrc.not.is.null').limit(2000),
    admin.from(SMART_LINKS_TABLE).select('release_id').limit(5000),
  ]);
  if (metaRes.error) throw new Error(metaRes.error.message);
  if (trmRes.error) throw new Error(trmRes.error.message);
  if (linkRes.error) throw new Error(linkRes.error.message);
  const has = new Set(((linkRes.data ?? []) as { release_id: string }[]).map((r) => r.release_id));
  const ids = new Set<string>();
  for (const row of [...(metaRes.data ?? []), ...(trmRes.data ?? [])] as Record<string, unknown>[]) {
    const id = text(row.release_id);
    if (id && !has.has(id) && (normalizeUpc(row.upc) || normalizeIsrc(row.isrc))) ids.add(id);
  }

  const report: BackfillReport = { dryRun: options.dryRun, candidates: ids.size, ready: 0, created: 0, notReady: {}, failed: 0 };
  let calls = 0;
  for (const id of Array.from(ids).slice(0, options.limit ?? 200)) {
    const facts = await loadSmartLinkFacts(admin, id);
    const decision = facts ? decideCreate(facts, now) : ({ ready: false, reason: 'no_release' } as const);
    if (!decision.ready) {
      report.notReady[decision.reason] = (report.notReady[decision.reason] ?? 0) + 1;
      continue;
    }
    report.ready += 1;
    if (options.dryRun) continue;
    if (calls > 0) await sleep(BACKFILL_GAP_MS);
    calls += 1;
    const outcome = await syncSmartLink(admin, id, { client: options.client, now });
    if (outcome.kind === 'created') report.created += 1;
    else if (outcome.kind === 'failed') report.failed += 1;
    else if (outcome.kind === 'not_ready') report.notReady[outcome.reason] = (report.notReady[outcome.reason] ?? 0) + 1;
  }
  return report;
}

/** The TRM webhook delivered a UPC or ISRC: find our rollout and sync it. */
export async function syncSmartLinkFromTrm(
  admin: SupabaseClient,
  input: { externalReleaseId: string | null; trmReleaseId: string | null }
): Promise<void> {
  let releaseId = input.externalReleaseId && /^[0-9a-f-]{36}$/i.test(input.externalReleaseId) ? input.externalReleaseId : null;
  if (!releaseId && input.trmReleaseId) {
    const { data } = await admin
      .from('distribution_submissions')
      .select('release_id')
      .eq('partner', 'trm')
      .eq('partner_release_id', input.trmReleaseId)
      .maybeSingle();
    releaseId = text((data as Record<string, unknown> | null)?.release_id);
  }
  if (releaseId) await syncSmartLinkQuietly(admin, releaseId);
}
