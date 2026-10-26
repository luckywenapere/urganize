// Send to TRM (URG-392): reads, writes and the TRM calls, server only. The rules
// are lib/trm/release.ts (pure) and the HTTP client lib/trm/client.ts.
//
// OPEN TO EVERY TEAM (founder, Oct 19, 2026, 03:10 WAT). A submit bills the
// ARTIST'S OWN TRM plan, not Urganize (founder, same night). canSendToTrm is
// still the one gate every TRM call passes: TRM configured, and the optional
// TRM_SEND_ALLOWED_EMAILS kill switch. When it says no, pressing Send records
// interest ("opens soon") without a single call to TRM.
//
// THE MASTER NEVER LANDS HERE. presignMaster hands the browser a short-lived
// R2 PUT URL; the bytes go browser -> R2. Urganize keeps the asset id only.

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logBillingEvent } from '../billing-events-server';
import { recordDistributionRejection, workspaceIdOf } from '../distribution-server';
import { loadHandoff, type LoadedHandoff } from '../handoff-server';
import { recordTrmFeeForSend } from './partner-ledger-server';
import { readTestRelease } from '../test-release';
import type { BillingEventType } from '../billing-events';
import {
  TrmApiError,
  completeTrmAsset,
  createTrmRelease,
  getTrmRelease,
  getTrmStores,
  idempotencyKey,
  presignTrmAsset,
  putToPresignedUrl,
  replaceTrmRelease,
  sha256Hex,
  submitTrmRelease,
  trmConfigured,
} from './client';
import {
  IN_FLIGHT,
  RECEIVED_MARKER,
  TRM_ARTIST_NOT_FOUND_TEXT,
  TRM_ARTWORK_MAX_BYTES,
  TRM_NO_REASON,
  TRM_AUDIO_MAX_BYTES,
  TRM_PARTNER,
  buildTrmReleaseInput,
  canSendToTrmEmail,
  isArtistNotFoundReason,
  readTrmSettings,
  receivedByTrm,
  rejectionFix,
  rejectionTitle,
  shouldApply,
  trmChecklist,
  type SubmissionStatus,
  type TrmChecklist,
  type TrmFacts,
  type TrmHistoryEntry,
  type TrmRow,
  type TrmSettings,
} from './release';
import { isTrmStatus, type TrmWebhookEvent } from './webhook';

const SUBMISSIONS = 'distribution_submissions';
const DELIVERIES = 'partner_webhook_deliveries';
const TASKS = 'tasks';
export const TRM_REJECTION_TASK_TAG = 'trm_rejection';

type Json = Record<string, unknown>;
const asRecord = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const asText = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const asNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function canSendToTrm(email: string | null | undefined): boolean {
  return trmConfigured() && canSendToTrmEmail(email, process.env.TRM_SEND_ALLOWED_EMAILS);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type ArtworkSource = { id: string; bucket: string; path: string; mimeType: string; fileName: string; sizeBytes: number | null };

export type LoadedTrmFacts = { facts: TrmFacts; artistId: string | null; ownerUserId: string; artworkSource: ArtworkSource | null };

export async function loadTrmFacts(admin: SupabaseClient, releaseId: string): Promise<LoadedTrmFacts | null> {
  const [releaseResult, metadataResult, creditsResult] = await Promise.all([
    admin
      .from('releases')
      .select('id,title,artist_name,artist_id,owner_user_id,release_date,release_type,artwork_asset_id')
      .eq('id', releaseId)
      .is('deleted_at', null)
      .maybeSingle(),
    admin
      .from('release_metadata')
      .select('genre,language,explicit,isrc,upc,label_name,featured_artists,lyrics')
      .eq('release_id', releaseId)
      .maybeSingle(),
    admin
      .from('release_credit_submissions')
      .select('legal_name,stage_name,roles,songwriter_split,master_split,person_hidden')
      .eq('release_id', releaseId),
  ]);
  if (releaseResult.error || metadataResult.error || creditsResult.error) return null;
  const release = releaseResult.data as Json | null;
  if (!release) return null;
  const metadata = asRecord(metadataResult.data);

  let artwork: TrmFacts['artwork'] = null;
  let artworkSource: ArtworkSource | null = null;
  const artworkId = asText(release.artwork_asset_id);
  if (artworkId) {
    const art = await admin
      .from('assets')
      .select('id,mime_type,metadata,file_size,file_name,storage_bucket,storage_path')
      .eq('id', artworkId)
      .maybeSingle();
    if (art.error) return null;
    const row = art.data as Json | null;
    if (row) {
      const image = asRecord(asRecord(row.metadata).image);
      artwork = {
        mimeType: asText(row.mime_type),
        width: asNumber(image.width),
        height: asNumber(image.height),
        sizeBytes: asNumber(row.file_size),
      };
      const bucket = asText(row.storage_bucket);
      const path = asText(row.storage_path);
      if (bucket && path) {
        artworkSource = {
          id: String(row.id),
          bucket,
          path,
          mimeType: asText(row.mime_type) ?? 'image/jpeg',
          fileName: asText(row.file_name) ?? 'cover.jpg',
          sizeBytes: asNumber(row.file_size),
        };
      }
    }
  }

  const releaseType = asText(release.release_type);
  const facts: TrmFacts = {
    releaseId,
    title: asText(release.title) ?? '',
    primaryArtist: asText(release.artist_name) ?? '',
    releaseType: releaseType === 'single' || releaseType === 'ep' || releaseType === 'album' ? releaseType : null,
    releaseDate: asText(release.release_date),
    genre: asText(metadata.genre),
    language: asText(metadata.language),
    explicit: typeof metadata.explicit === 'boolean' ? metadata.explicit : null,
    isrc: asText(metadata.isrc),
    upc: asText(metadata.upc),
    labelName: asText(metadata.label_name),
    featuredArtists: asText(metadata.featured_artists),
    lyrics: asText(metadata.lyrics),
    artwork,
    credits: ((creditsResult.data as Json[] | null) ?? []).map((row) => ({
      name: asText(row.stage_name) ?? asText(row.legal_name) ?? '',
      roles: Array.isArray(row.roles) ? row.roles.filter((r): r is string => typeof r === 'string') : [],
      songwriterSplit: asNumber(row.songwriter_split),
      masterSplit: asNumber(row.master_split),
    })),
  };
  return {
    facts,
    artistId: asText(release.artist_id),
    ownerUserId: String(release.owner_user_id ?? ''),
    artworkSource,
  };
}

export type SubmissionRow = {
  id: string;
  release_id: string;
  partner: string;
  artist_id: string | null;
  artist_email: string | null;
  partner_release_id: string | null;
  status: SubmissionStatus;
  history: TrmHistoryEntry[];
  settings: Json;
  artwork_asset_id: string | null;
  artwork_source_id: string | null;
  audio_asset_id: string | null;
  audio_file_name: string | null;
  submit_count: number;
  last_event: string | null;
  last_event_at: string | null;
  upc: string | null;
  isrc: string | null;
  error: string | null;
  terms_accepted_at: string | null;
  submitted_at: string | null;
  updated_at: string | null;
};

const SUBMISSION_COLUMNS =
  'id,release_id,partner,artist_id,artist_email,partner_release_id,status,history,settings,artwork_asset_id,artwork_source_id,audio_asset_id,audio_file_name,submit_count,last_event,last_event_at,upc,isrc,error,terms_accepted_at,submitted_at,updated_at';

const toRow = (data: unknown): SubmissionRow | null => {
  const r = data as SubmissionRow | null;
  if (!r) return null;
  return { ...r, history: Array.isArray(r.history) ? r.history : [], settings: asRecord(r.settings) };
};

export async function loadSubmission(admin: SupabaseClient, releaseId: string): Promise<SubmissionRow | null | 'error'> {
  const { data, error } = await admin
    .from(SUBMISSIONS)
    .select(SUBMISSION_COLUMNS)
    .eq('release_id', releaseId)
    .eq('partner', TRM_PARTNER)
    .maybeSingle();
  if (error) return 'error';
  return toRow(data);
}

/** The artist's TRM email from any earlier rollout of theirs. */
async function rememberedArtistEmail(admin: SupabaseClient, artistId: string | null): Promise<string | null> {
  if (!artistId) return null;
  const { data } = await admin
    .from(SUBMISSIONS)
    .select('artist_email,updated_at')
    .eq('artist_id', artistId)
    .eq('partner', TRM_PARTNER)
    .not('artist_email', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1);
  return asText((data as Json[] | null)?.[0]?.artist_email);
}

async function saveSubmission(
  admin: SupabaseClient,
  releaseId: string,
  patch: Partial<Omit<SubmissionRow, 'id' | 'release_id' | 'partner'>> & { created_by?: string; submitted_by?: string }
): Promise<SubmissionRow | null> {
  const { data, error } = await admin
    .from(SUBMISSIONS)
    .upsert(
      { release_id: releaseId, partner: TRM_PARTNER, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'release_id,partner' }
    )
    .select(SUBMISSION_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error('[trm] could not save the submission', error.message);
    return null;
  }
  return toRow(data);
}

const withHistory = (history: readonly TrmHistoryEntry[], entry: TrmHistoryEntry): TrmHistoryEntry[] =>
  [...history, entry].slice(-50);

// ---------------------------------------------------------------------------
// The payload the Distribute step reads
// ---------------------------------------------------------------------------

export type TrmOwner = { name: string; initial: string; isYou: boolean };
export type TrmRowView = TrmRow & { owner: TrmOwner | null };
export type TrmFixRow = {
  id: string;
  title: string;
  reason: string;
  fix: string | null;
  owner: TrmOwner | null;
  due: string | null;
  doneAt: string | null;
};

export type TrmPayload = {
  canSend: boolean;
  releaseType: TrmFacts['releaseType'];
  releaseDate: string | null;
  primaryArtist: string;
  title: string;
  checklist: Omit<TrmChecklist, 'blocking' | 'ready'> & { blocking: TrmRowView[]; ready: TrmRowView[] };
  settings: TrmSettings;
  artistEmail: string | null;
  submission: {
    status: SubmissionStatus;
    history: TrmHistoryEntry[];
    submittedAt: string | null;
    lastEventAt: string | null;
    upc: string | null;
    isrc: string | null;
    error: string | null;
    hasDraft: boolean;
    masterFileName: string | null;
  } | null;
  fixes: TrmFixRow[];
};

function ownerFor(loaded: LoadedHandoff | null, item: 'cover_art' | 'metadata'): TrmOwner | null {
  if (!loaded) return null;
  const ownerId = loaded.payload.items.find((i) => i.key === item)?.ownerUserId;
  const member = loaded.payload.members.find((m) => m.userId === ownerId);
  return member ? { name: member.isYou ? 'You' : member.name, initial: member.initial, isYou: member.isYou } : null;
}

function memberById(loaded: LoadedHandoff | null, userId: string | null): TrmOwner | null {
  if (!loaded || !userId) return null;
  const member = loaded.payload.members.find((m) => m.userId === userId);
  return member ? { name: member.isYou ? 'You' : member.name, initial: member.initial, isYou: member.isYou } : null;
}

async function loadFixes(admin: SupabaseClient, releaseId: string, submission: SubmissionRow, loaded: LoadedHandoff | null): Promise<TrmFixRow[]> {
  const lastRejected = [...submission.history].reverse().find((h) => h.status === 'rejected') as
    | (TrmHistoryEntry & { rejectionIds?: string[] })
    | undefined;
  const ids = Array.isArray(lastRejected?.rejectionIds) ? lastRejected.rejectionIds : [];
  if (ids.length === 0) return [];
  const [rejections, tasks] = await Promise.all([
    admin.from('distribution_rejections').select('id,reason_code,reason_text').in('id', ids),
    admin.from(TASKS).select('id,status,assigned_to_user_id,due_date,completed_at,metadata').eq('release_id', releaseId),
  ]);
  const byRejection = new Map<string, Json>();
  for (const task of (tasks.data as Json[] | null) ?? []) {
    const tag = asText(asRecord(task.metadata)[TRM_REJECTION_TASK_TAG]);
    if (tag) byRejection.set(tag, task);
  }
  return ((rejections.data as Json[] | null) ?? []).map((r) => {
    const id = String(r.id);
    const code = asText(r.reason_code);
    const reason = asText(r.reason_text) ?? TRM_NO_REASON;
    const task = byRejection.get(id);
    const done = task && String(task.status) === 'done';
    return {
      id,
      title: rejectionTitle(code, reason),
      reason,
      fix: rejectionFix(code, reason),
      owner: memberById(loaded, asText(task?.assigned_to_user_id)),
      due: asText(task?.due_date)?.slice(0, 10) ?? null,
      doneAt: done ? asText(task?.completed_at) ?? new Date().toISOString() : null,
    };
  });
}

export async function loadTrmPayload(
  admin: SupabaseClient,
  releaseId: string,
  viewer: { id: string; email: string | null },
  now: Date = new Date()
): Promise<TrmPayload | null> {
  const [loadedFacts, submission, loaded] = await Promise.all([
    loadTrmFacts(admin, releaseId),
    loadSubmission(admin, releaseId),
    loadHandoff(admin, releaseId, viewer.id, { sync: false }).catch(() => null),
  ]);
  if (!loadedFacts || submission === 'error') return null;
  const settings = readTrmSettings(submission?.settings);
  const checklist = trmChecklist(loadedFacts.facts, settings, now);
  const decorate = (row: TrmRow): TrmRowView => ({ ...row, owner: ownerFor(loaded, row.ownerItem) });
  const artistEmail = submission?.artist_email ?? (await rememberedArtistEmail(admin, loadedFacts.artistId));
  return {
    canSend: canSendToTrm(viewer.email),
    releaseType: loadedFacts.facts.releaseType,
    releaseDate: loadedFacts.facts.releaseDate,
    primaryArtist: loadedFacts.facts.primaryArtist,
    title: loadedFacts.facts.title,
    checklist: { ...checklist, blocking: checklist.blocking.map(decorate), ready: checklist.ready.map(decorate) },
    settings,
    artistEmail,
    submission: submission
      ? {
          status: submission.status,
          history: submission.history,
          submittedAt: submission.submitted_at,
          lastEventAt: submission.last_event_at,
          upc: submission.upc,
          isrc: submission.isrc,
          error: submission.error,
          hasDraft: Boolean(submission.partner_release_id),
          masterFileName: submission.audio_file_name,
        }
      : null,
    fixes: submission ? await loadFixes(admin, releaseId, submission, loaded) : [],
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type TrmActor = { id: string; email: string | null };
export type TrmResult<T = Json> = { ok: true; data: T } | { ok: false; status: number; code: string; error: string };

const fail = (status: number, code: string, error: string): TrmResult<never> => ({ ok: false, status, code, error });

async function logEvent(admin: SupabaseClient, ownerUserId: string, actorUserId: string | null, type: BillingEventType, metadata: Json) {
  const workspaceId = await workspaceIdOf(admin, ownerUserId);
  await logBillingEvent(admin, { workspaceId, ownerUserId, actorUserId, type, metadata: { partner: TRM_PARTNER, ...metadata } });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Save the artist's TRM email and the rights & policy choices. */
export async function saveTrmSettings(
  admin: SupabaseClient,
  releaseId: string,
  actor: TrmActor,
  input: { artistEmail?: unknown; settings?: unknown }
): Promise<TrmResult> {
  const current = await loadSubmission(admin, releaseId);
  if (current === 'error') return fail(500, 'read_failed', 'Could not save. Try again.');
  if (current && IN_FLIGHT.includes(current.status)) return fail(409, 'in_flight', 'It is already with TRM.');
  const patch: Parameters<typeof saveSubmission>[2] = {};
  if (input.artistEmail !== undefined) {
    const email = asText(input.artistEmail)?.toLowerCase() ?? null;
    if (email && !EMAIL.test(email)) return fail(400, 'bad_email', 'That email does not look right.');
    patch.artist_email = email;
    const loaded = await loadTrmFacts(admin, releaseId);
    if (loaded?.artistId) patch.artist_id = loaded.artistId;
  }
  if (input.settings !== undefined) {
    patch.settings = readTrmSettings({ ...asRecord(current?.settings), ...asRecord(input.settings) }) as unknown as Json;
  }
  if (!current) {
    patch.status = 'preparing';
    patch.created_by = actor.id;
  }
  const saved = await saveSubmission(admin, releaseId, patch);
  return saved ? { ok: true, data: {} } : fail(500, 'write_failed', 'Could not save. Try again.');
}

/** A team outside the allowlist pressed Send: remember it, call nobody. */
export async function recordTrmInterest(admin: SupabaseClient, releaseId: string, actor: TrmActor, ownerUserId: string): Promise<TrmResult> {
  const current = await loadSubmission(admin, releaseId);
  if (current === 'error') return fail(500, 'read_failed', 'Could not save. Try again.');
  if (current?.status !== 'waitlisted') {
    await saveSubmission(admin, releaseId, {
      status: 'waitlisted',
      history: withHistory(current?.history ?? [], { status: 'waitlisted', at: new Date().toISOString() }),
      ...(current ? {} : { created_by: actor.id }),
    });
    await logEvent(admin, ownerUserId, actor.id, 'trm_send_interest', { releaseId });
  }
  return { ok: true, data: { waitlisted: true } };
}

/**
 * TRM checks the artist account ASYNCHRONOUSLY, during delivery (TRM, Oct 19,
 * 2026): a draft and a submit can succeed and the send then fail with
 * release.delivery_failed / artist_not_found (handled in the webhook). So a
 * draft-time error only counts as "no account" when TRM names the exact code;
 * v1.160.0's guess (any 422 mentioning "artist") is gone.
 */
function isArtistNotFound(error: TrmApiError): boolean {
  return error.code === 'artist_not_found';
}

/** Rounds of sending: 0 before the first submit, N after N submits. Every
 *  write key carries it, so a resubmit after a rejection never reuses an
 *  Idempotency-Key from the round TRM rejected (TRM, Oct 19, 2026). */
const roundOf = (row: SubmissionRow | null | undefined): string => `r${row?.submit_count ?? 0}`;

/** Statuses TRM rejected, where the team fixes and resubmits. */
const SENT_BACK: readonly SubmissionStatus[] = ['rejected', 'needs_account'];

function trmMessage(error: unknown): string {
  if (error instanceof TrmApiError) {
    const details = error.details
      .map((d) => (typeof d === 'string' ? d : asText(asRecord(d).message) ?? asText(asRecord(d).field)))
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');
    return `${error.message}${details ? ` ${details}` : ''}`.slice(0, 500);
  }
  return 'TRM did not answer. Try again.';
}

/**
 * Create (or refresh) the TRM draft and upload the cover art. Safe to retry:
 * the create key is derived from the exact body, PATCH replaces in place, and
 * the artwork is re-sent only when the rollout's artwork changed.
 */
export async function prepareTrmDraft(
  admin: SupabaseClient,
  releaseId: string,
  actor: TrmActor,
  input: { artistEmail: unknown; termsAccepted: unknown }
): Promise<TrmResult<{ status: SubmissionStatus }>> {
  if (!canSendToTrm(actor.email)) return fail(403, 'not_open', 'Sending to TRM opens soon.');
  if (input.termsAccepted !== true) return fail(400, 'terms', 'Agree to TRM’s terms first.');
  const email = asText(input.artistEmail)?.toLowerCase() ?? null;
  if (!email || !EMAIL.test(email)) return fail(400, 'bad_email', 'Add the artist’s TRM email.');

  const [loaded, current] = await Promise.all([loadTrmFacts(admin, releaseId), loadSubmission(admin, releaseId)]);
  if (!loaded || current === 'error') return fail(500, 'read_failed', 'Could not check this rollout. Try again.');
  if (current && (IN_FLIGHT.includes(current.status) || current.status === 'published')) {
    return fail(409, 'in_flight', 'It is already with TRM.');
  }
  const settings = readTrmSettings(current?.settings);
  const checklist = trmChecklist(loaded.facts, settings, new Date());
  if (checklist.singlesOnly) return fail(409, 'singles_only', 'Singles first. EPs and albums are coming.');
  if (checklist.blocking.length > 0) {
    return fail(409, 'not_ready', `${checklist.blocking.length} things before it can go.`);
  }
  // Test rollouts (the sample data) never leave Urganize.
  const testCheck = await admin.from('releases').select('metadata').eq('id', releaseId).maybeSingle();
  if (readTestRelease(asRecord(testCheck.data).metadata as Parameters<typeof readTestRelease>[0])) return fail(409, 'test_release', 'Sample rollouts can’t be sent.');

  // TRM refuses ["all"]: send its explicit store list (cached for an hour).
  const body = buildTrmReleaseInput(loaded.facts, settings, email, await getTrmStores());
  const round = roundOf(current);
  const sentBack = Boolean(current && SENT_BACK.includes(current.status));
  const base = {
    artist_email: email,
    artist_id: loaded.artistId,
    terms_accepted_at: new Date().toISOString(),
    ...(current ? {} : { created_by: actor.id }),
  };

  let partnerReleaseId = current?.partner_release_id ?? null;
  try {
    if (partnerReleaseId) {
      await replaceTrmRelease(partnerReleaseId, body, idempotencyKey(releaseId, `patch:${partnerReleaseId}:${round}`, body));
    } else {
      const created = await createTrmRelease(body, idempotencyKey(releaseId, 'create', body));
      partnerReleaseId = created.id;
    }
  } catch (error) {
    if (error instanceof TrmApiError && isArtistNotFound(error)) {
      await saveSubmission(admin, releaseId, {
        ...base,
        status: 'needs_account',
        error: trmMessage(error),
        history: withHistory(current?.history ?? [], { status: 'needs_account', at: new Date().toISOString() }),
      });
      return fail(422, 'artist_not_found', 'No TRM account for that email.');
    }
    await saveSubmission(admin, releaseId, { ...base, status: sentBack && current ? current.status : 'preparing', error: trmMessage(error) });
    return fail(502, 'trm_error', trmMessage(error));
  }

  const wasNew = !current?.partner_release_id;
  let row = await saveSubmission(admin, releaseId, {
    ...base,
    partner_release_id: partnerReleaseId,
    status: sentBack && current ? current.status : 'draft',
    // A sent-back release keeps its reason on screen until it is resubmitted.
    ...(sentBack ? {} : { error: null }),
    ...(sentBack
      ? {}
      : { history: withHistory(current?.history ?? [], { status: 'draft', at: new Date().toISOString() }) }),
  });
  if (!row) return fail(500, 'write_failed', 'Could not save. Try again.');
  if (wasNew) await logEvent(admin, loaded.ownerUserId, actor.id, 'trm_send_started', { releaseId, trmReleaseId: partnerReleaseId });

  // Cover art: server-side, from our storage, only when it changed.
  const art = loaded.artworkSource;
  if (!art) return fail(409, 'not_ready', 'Add cover art.');
  if (row.artwork_source_id !== art.id || !row.artwork_asset_id) {
    try {
      const download = await admin.storage.from(art.bucket).download(art.path);
      if (download.error || !download.data) throw new TrmApiError(500, 'Could not read the cover art.', 'artwork_read');
      const bytes = await download.data.arrayBuffer();
      if (bytes.byteLength > TRM_ARTWORK_MAX_BYTES) return fail(409, 'artwork_too_big', 'TRM takes cover art up to 20 MB.');
      const sha = sha256HexBytes(bytes);
      const presignBody = {
        type: 'artwork' as const,
        file_name: art.fileName.slice(0, 180),
        mime_type: art.mimeType,
        size_bytes: bytes.byteLength,
        sha256: sha,
      };
      const presign = await presignTrmAsset(
        partnerReleaseId as string,
        presignBody,
        idempotencyKey(releaseId, `artwork:${partnerReleaseId}:${round}`, presignBody)
      );
      await putToPresignedUrl(presign.upload, bytes, art.mimeType);
      await completeTrmAsset(partnerReleaseId as string, presign.asset.id, idempotencyKey(releaseId, `artwork-complete:${presign.asset.id}:${round}`));
      row = (await saveSubmission(admin, releaseId, { artwork_asset_id: presign.asset.id, artwork_source_id: art.id })) ?? row;
    } catch (error) {
      await saveSubmission(admin, releaseId, { error: trmMessage(error) });
      return fail(502, 'artwork_failed', trmMessage(error));
    }
  }
  return { ok: true, data: { status: row.status } };
}

function sha256HexBytes(bytes: ArrayBuffer): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

const AUDIO_MIME = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/flac', 'audio/x-flac'];

/** A short-lived PUT URL for the browser to send the master straight to TRM. */
export async function presignMaster(
  admin: SupabaseClient,
  releaseId: string,
  actor: TrmActor,
  input: { fileName: unknown; mimeType: unknown; sizeBytes: unknown; sha256: unknown }
): Promise<TrmResult<{ assetId: string; url: string; headers: Record<string, string> }>> {
  if (!canSendToTrm(actor.email)) return fail(403, 'not_open', 'Sending to TRM opens soon.');
  const current = await loadSubmission(admin, releaseId);
  if (current === 'error' || !current?.partner_release_id) return fail(409, 'no_draft', 'Start the send again.');
  const fileName = asText(input.fileName)?.slice(0, 180) ?? 'master.wav';
  const mimeType = (asText(input.mimeType) ?? '').toLowerCase() || 'audio/wav';
  const size = asNumber(input.sizeBytes);
  const sha = asText(input.sha256)?.toLowerCase() ?? '';
  if (!AUDIO_MIME.includes(mimeType)) return fail(400, 'bad_type', 'The master has to be a WAV.');
  if (!size || size < 1 || size > TRM_AUDIO_MAX_BYTES) return fail(400, 'too_big', 'TRM takes masters up to 150 MB.');
  if (!/^[a-f0-9]{64}$/.test(sha)) return fail(400, 'bad_hash', 'Could not read the file. Try again.');
  const body = { type: 'audio' as const, file_name: fileName, mime_type: mimeType, size_bytes: size, sha256: sha, track_sequence: 1 };
  try {
    const presign = await presignTrmAsset(
      current.partner_release_id,
      body,
      idempotencyKey(releaseId, `audio:${current.partner_release_id}:${roundOf(current)}`, body)
    );
    return {
      ok: true,
      data: {
        assetId: presign.asset.id,
        url: presign.upload.url,
        headers: { 'Content-Type': mimeType, ...(presign.upload.required_headers ?? {}) },
      },
    };
  } catch (error) {
    return fail(502, 'trm_error', trmMessage(error));
  }
}

export async function completeMaster(
  admin: SupabaseClient,
  releaseId: string,
  actor: TrmActor,
  input: { assetId: unknown; fileName: unknown }
): Promise<TrmResult> {
  if (!canSendToTrm(actor.email)) return fail(403, 'not_open', 'Sending to TRM opens soon.');
  const current = await loadSubmission(admin, releaseId);
  const assetId = asText(input.assetId);
  if (current === 'error' || !current?.partner_release_id || !assetId) return fail(409, 'no_draft', 'Start the send again.');
  try {
    await completeTrmAsset(current.partner_release_id, assetId, idempotencyKey(releaseId, `audio-complete:${assetId}:${roundOf(current)}`));
  } catch (error) {
    return fail(502, 'trm_error', trmMessage(error));
  }
  await saveSubmission(admin, releaseId, { audio_asset_id: assetId, audio_file_name: asText(input.fileName)?.slice(0, 180) ?? null });
  return { ok: true, data: {} };
}

/** Mark the handoff rows sent and close their tasks, so reminders stop. */
async function markHandoffSent(admin: SupabaseClient, releaseId: string, actorId: string) {
  const loaded = await loadHandoff(admin, releaseId, actorId, { sync: false }).catch(() => null);
  if (!loaded) return;
  const nowIso = new Date().toISOString();
  for (const [, task] of loaded.tasks) {
    if (String(task.status) !== 'done') {
      await admin.from(TASKS).update({ status: 'done', completed_at: nowIso }).eq('id', task.id);
    }
  }
  const { data } = await admin.from('releases').select('metadata').eq('id', releaseId).maybeSingle();
  const metadata = asRecord(asRecord(data).metadata);
  const handoff = asRecord(metadata.handoff);
  const next: Json = { ...handoff };
  for (const item of ['master', 'cover_art', 'metadata']) {
    const record = asRecord(handoff[item]);
    if (!asText(record.sentAt)) next[item] = { ...record, sentAt: nowIso, sentBy: actorId };
  }
  await admin.from('releases').update({ metadata: { ...metadata, handoff: next } }).eq('id', releaseId);
}

/** Submit to stores. Allowlisted accounts only (see the top of this file). */
export async function submitToTrm(admin: SupabaseClient, releaseId: string, actor: TrmActor): Promise<TrmResult<{ status: SubmissionStatus }>> {
  if (!canSendToTrm(actor.email)) return fail(403, 'not_open', 'Sending to TRM opens soon.');
  const [current, loaded] = await Promise.all([loadSubmission(admin, releaseId), loadTrmFacts(admin, releaseId)]);
  if (current === 'error' || !loaded) return fail(500, 'read_failed', 'Could not check this rollout. Try again.');
  if (!current?.partner_release_id) return fail(409, 'no_draft', 'Start the send again.');
  if (IN_FLIGHT.includes(current.status) || current.status === 'published') return { ok: true, data: { status: current.status } };
  if (!current.artwork_asset_id) return fail(409, 'no_artwork', 'The cover art did not reach TRM. Try again.');
  if (!current.audio_asset_id) return fail(409, 'no_master', 'Add the master.');
  const checklist = trmChecklist(loaded.facts, readTrmSettings(current.settings), new Date());
  if (checklist.blocking.length > 0) return fail(409, 'not_ready', `${checklist.blocking.length} things before it can go.`);

  const attempt = current.submit_count + 1;
  try {
    // A resubmit after a rejection: TRM wants the full metadata PATCHed (done
    // in prepare), the assets RE-VERIFIED, then submit, all on new keys. The
    // complete keys match the ones prepare/complete_master used this round, so
    // an asset already re-checked this round is a byte-identical replay.
    if (current.submit_count > 0) {
      const round = roundOf(current);
      await completeTrmAsset(current.partner_release_id, current.artwork_asset_id, idempotencyKey(releaseId, `artwork-complete:${current.artwork_asset_id}:${round}`));
      await completeTrmAsset(current.partner_release_id, current.audio_asset_id, idempotencyKey(releaseId, `audio-complete:${current.audio_asset_id}:${round}`));
    }
    await submitTrmRelease(current.partner_release_id, idempotencyKey(releaseId, `submit:${current.partner_release_id}:${attempt}`));
  } catch (error) {
    await saveSubmission(admin, releaseId, { error: trmMessage(error) });
    return fail(502, 'trm_error', trmMessage(error));
  }
  const nowIso = new Date().toISOString();
  await saveSubmission(admin, releaseId, {
    status: 'submitted',
    submit_count: attempt,
    submitted_at: nowIso,
    submitted_by: actor.id,
    error: null,
    history: withHistory(current.history, { status: 'submitted', at: nowIso }),
  });
  await markHandoffSent(admin, releaseId, actor.id);
  await recordTrmFeeForSend(admin, { ownerUserId: loaded.ownerUserId, releaseId, attempt, sentAt: new Date(nowIso) });
  await logEvent(admin, loaded.ownerUserId, actor.id, 'trm_submitted', { releaseId, trmReleaseId: current.partner_release_id, attempt });
  return { ok: true, data: { status: 'submitted' } };
}

/** Fallback poll for when a webhook is late. */
export async function refreshFromTrm(
  admin: SupabaseClient,
  releaseId: string
): Promise<TrmResult<{ status: SubmissionStatus; received: boolean }>> {
  const current = await loadSubmission(admin, releaseId);
  if (current === 'error' || !current?.partner_release_id) return fail(409, 'no_draft', 'Nothing at TRM yet.');
  if (!trmConfigured()) return { ok: true, data: { status: current.status, received: receivedByTrm(current.status, current.history) } };
  try {
    const release = await getTrmRelease(current.partner_release_id);
    const nowIso = new Date().toISOString();
    const trmReleaseId = asText(release.trm_release_id);
    // TRM's rejected covers both a review rejection and a delivery that found
    // no artist; we show the second as needs_account, so do not flip it back.
    const unchanged = release.status === current.status || (release.status === 'rejected' && current.status === 'needs_account');
    if (isTrmStatus(release.status) && !unchanged && release.status !== 'draft') {
      const reasons = release.status === 'rejected' ? reasonsFromTrmRelease(release) : [];
      const status: SubmissionStatus = release.status === 'rejected' && reasons.some(isArtistNotFoundReason) ? 'needs_account' : release.status;
      await applyStatus(admin, current, {
        status,
        ...(status === 'needs_account' ? { error: TRM_ARTIST_NOT_FOUND_TEXT } : {}),
        at: nowIso,
        event: 'poll',
        reasons,
        upc: asText(release.upc),
        isrc: asText(release.tracks?.[0]?.isrc),
        trmReleaseId,
        enriched: true,
        raw: { polled: true },
      });
      const received = receivedByTrm(status, trmReleaseId ? [{ status: RECEIVED_MARKER, at: nowIso }] : []);
      return { ok: true, data: { status, received } };
    }
    const receipt = receiptEntry(current, trmReleaseId, nowIso, 'poll');
    const history = receipt ? withHistory(current.history, receipt) : current.history;
    if (receipt) await saveSubmission(admin, releaseId, { history });
    return { ok: true, data: { status: current.status, received: receivedByTrm(current.status, history) } };
  } catch (error) {
    return fail(502, 'trm_error', trmMessage(error));
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

type StatusChange = {
  status: SubmissionStatus;
  at: string;
  event: string | null;
  reasons: TrmWebhookEvent['reasons'];
  upc: string | null;
  isrc: string | null;
  trmReleaseId?: string | null;
  /** The reasons already include GET /releases/{id} (skip the extra call). */
  enriched?: boolean;
  /** The text the team reads for this state (needs_account). */
  error?: string | null;
  raw: unknown;
};

const IN_FLIGHT_OR_DONE: readonly string[] = ['submitted', 'validating', 'accepted', 'processing', 'published'];

/** A "Received by TRM" marker when TRM first reports its own release id for
 *  this round (see receivedByTrm in release.ts). Null when nothing is new. */
function receiptEntry(current: SubmissionRow, trmReleaseId: string | null, at: string, event: string | null): TrmHistoryEntry | null {
  if (!trmReleaseId || !IN_FLIGHT_OR_DONE.includes(current.status)) return null;
  for (let i = current.history.length - 1; i >= 0; i -= 1) {
    if (current.history[i].status === RECEIVED_MARKER) return null;
    if (current.history[i].status === 'submitted') break;
  }
  return { status: RECEIVED_MARKER, at, event, trmReleaseId };
}

type Reason = TrmWebhookEvent['reasons'][number];
type RejectionEntry = TrmHistoryEntry & { rejectionIds?: string[]; reasons?: string[] };

/** The rejected entry of the current round (after the latest submit), if any. */
function lastRejectionThisRound(history: readonly TrmHistoryEntry[]): RejectionEntry | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].status === 'rejected') return history[i] as RejectionEntry;
    if (history[i].status === 'submitted') return null;
  }
  return null;
}

/** Reasons from GET /releases/{id}: data.validation_errors and data.review.
 *  Neither shape is documented, so strings, {code|field, message} objects and
 *  field -> message maps are all read, two levels deep. */
export function reasonsFromTrmRelease(release: { validation_errors?: unknown; review?: unknown }): Reason[] {
  const out: Reason[] = [];
  const seen = new Set<string>();
  const push = (code: string | null, text: string | null) => {
    const clean = text?.trim();
    if (!clean) return;
    const key = `${code ?? ''}|${clean}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ code, text: clean.slice(0, 2000) });
  };
  const read = (value: unknown, field: string | null, depth: number) => {
    if (depth > 2 || value === null || value === undefined) return;
    if (typeof value === 'string') return push(field, value);
    if (Array.isArray(value)) return value.forEach((v) => read(v, field, depth + 1));
    if (typeof value !== 'object') return;
    const r = value as Json;
    const message = asText(r.message) ?? asText(r.reason) ?? asText(r.detail) ?? asText(r.text) ?? asText(r.notes) ?? asText(r.comment);
    if (message) return push(asText(r.code) ?? asText(r.field) ?? field, message);
    for (const [k, v] of Object.entries(r)) {
      if (['status', 'reviewed_at', 'reviewer', 'reviewed_by', 'created_at', 'updated_at', 'id'].includes(k)) continue;
      read(v, k, depth + 1);
    }
  };
  read(release.validation_errors, null, 0);
  read(release.review, null, 0);
  return out;
}

async function applyStatus(admin: SupabaseClient, current: SubmissionRow, change: StatusChange): Promise<void> {
  const releaseId = current.release_id;
  const facts = await loadTrmFacts(admin, releaseId);
  const ownerUserId = facts?.ownerUserId ?? '';
  const entry: RejectionEntry = { status: change.status, at: change.at, event: change.event };
  const receipt = change.status === 'rejected' || change.status === 'needs_account' ? null : receiptEntry({ ...current, status: change.status }, change.trmReleaseId ?? null, change.at, change.event);

  if (change.status === 'needs_account' && ownerUserId) {
    await logEvent(admin, ownerUserId, null, 'trm_rejected', { releaseId, reason: 'artist_not_found' });
  }

  if (change.status === 'rejected') {
    // TRM: fetch the release on a rejection; validation_errors and review add
    // what the webhook's free-text reason leaves out.
    let found = change.reasons;
    if (!change.enriched && current.partner_release_id && trmConfigured()) {
      try {
        const extra = reasonsFromTrmRelease(await getTrmRelease(current.partner_release_id));
        const known = new Set(found.map((r) => r.text));
        found = [...found, ...extra.filter((r) => !known.has(r.text))];
      } catch (error) {
        console.error('[trm] could not read the rejected release', error instanceof Error ? error.message : error);
      }
    }
    const reasons = found.length ? found : [{ code: null, text: TRM_NO_REASON }];
    const loaded = await loadHandoff(admin, releaseId, ownerUserId, { sync: false }).catch(() => null);
    const ids: string[] = [];
    const due = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    for (const reason of reasons) {
      const id = await recordDistributionRejection(admin, {
        releaseId,
        ownerUserId,
        reasonCode: reason.code,
        reasonText: reason.text,
        raw: change.raw,
        partner: TRM_PARTNER,
      });
      if (!id) continue;
      ids.push(id);
      const fix = rejectionFix(reason.code, reason.text);
      const item = fix === 'artwork' ? 'cover_art' : 'metadata';
      const assignee = loaded?.payload.items.find((i) => i.key === item)?.ownerUserId ?? ownerUserId;
      if (loaded?.workspaceId) {
        const result = await admin.from(TASKS).insert({
          id: randomUUID(),
          release_id: releaseId,
          workspace_id: loaded.workspaceId,
          created_by: ownerUserId,
          assigned_to_user_id: assignee,
          title: `Fix for TRM: ${rejectionTitle(reason.code, reason.text)}`,
          description: `TRM sent the release back: “${reason.text}”`,
          status: 'todo',
          priority: 'high',
          state: 'planning',
          position: 0,
          auto_generated: true,
          due_date: `${due}T00:00:00.000Z`,
          metadata: { [TRM_REJECTION_TASK_TAG]: id },
        });
        if (result.error) console.error('[trm] could not add a fix task', result.error.message);
      }
    }
    // Same round, rejected again: keep the earlier fixes on screen too.
    const previous = current.status === 'rejected' ? lastRejectionThisRound(current.history) : null;
    entry.rejectionIds = [...(previous?.rejectionIds ?? []), ...ids];
    entry.reasons = [...(previous?.reasons ?? []), ...reasons.map((r) => r.text)].slice(-20);
    if (ownerUserId) await logEvent(admin, ownerUserId, null, 'trm_rejected', { releaseId, reasons: reasons.length });
  }
  if (change.status === 'published' && ownerUserId) {
    await logEvent(admin, ownerUserId, null, 'trm_published', { releaseId });
  }

  const withEntry = withHistory(current.history, entry);
  const history = receipt ? withHistory(withEntry, receipt) : withEntry;
  await saveSubmission(admin, releaseId, {
    status: change.status,
    last_event: change.event,
    last_event_at: change.at,
    history,
    ...(change.error !== undefined ? { error: change.error } : {}),
    ...(change.upc ? { upc: change.upc } : {}),
    ...(change.isrc ? { isrc: change.isrc } : {}),
  });
}

export type WebhookOutcome = 'applied' | 'duplicate' | 'stale' | 'no_release' | 'no_status' | 'error';

/**
 * Apply one verified delivery. The delivery row is written FIRST and its
 * primary key is the dedupe: a replay loses the insert and changes nothing.
 */
export async function applyTrmWebhook(
  admin: SupabaseClient,
  event: TrmWebhookEvent,
  input: { headers: Json; payload: unknown; signedAt: number }
): Promise<WebhookOutcome> {
  const deliveryId = event.deliveryId ?? `sig:${sha256Hex(JSON.stringify(input.payload)).slice(0, 40)}`;
  const insert = await admin.from(DELIVERIES).insert({
    partner: TRM_PARTNER,
    delivery_id: deliveryId,
    event: event.event,
    verified: true,
    partner_release_id: event.releaseId,
    outcome: 'received',
    headers: input.headers,
    payload: input.payload as Json,
  });
  if (insert.error) {
    if (insert.error.code === '23505') return 'duplicate';
    console.error('[trm] could not store a delivery', insert.error.message);
    return 'error';
  }

  const finish = async (outcome: WebhookOutcome, releaseId: string | null = null) => {
    await admin.from(DELIVERIES).update({ outcome, release_id: releaseId }).eq('partner', TRM_PARTNER).eq('delivery_id', deliveryId);
    return outcome;
  };

  let current: SubmissionRow | null = null;
  if (event.releaseId) {
    const { data } = await admin
      .from(SUBMISSIONS)
      .select(SUBMISSION_COLUMNS)
      .eq('partner', TRM_PARTNER)
      .eq('partner_release_id', event.releaseId)
      .maybeSingle();
    current = toRow(data);
  }
  if (!current && event.externalReleaseId && /^[0-9a-f-]{36}$/i.test(event.externalReleaseId)) {
    const found = await loadSubmission(admin, event.externalReleaseId);
    current = found === 'error' ? null : found;
  }
  if (!current) return finish('no_release');
  if (!event.status) return finish('no_status', current.release_id);

  const at = event.occurredAt && Number.isFinite(Date.parse(event.occurredAt)) ? new Date(event.occurredAt).toISOString() : new Date(input.signedAt * 1000).toISOString();
  if (!shouldApply(current.last_event_at, at)) return finish('stale', current.release_id);

  // What this delivery means for us. TRM (Oct 19, 2026): a rejection is
  // release.status_changed -> rejected (reason may be null); a failed delivery
  // into TRM is release.delivery_failed (status rejected, connector JSON in
  // data.message). artist_not_found becomes our needs_account.
  const reasons = event.failure ? [event.failure] : event.reasons;
  let status: SubmissionStatus = event.status;
  if (status === 'rejected' && reasons.some(isArtistNotFoundReason)) status = 'needs_account';
  const stampOnly = async () => {
    const receipt = receiptEntry(current as SubmissionRow, event.trmReleaseId, at, event.event);
    await saveSubmission(admin, (current as SubmissionRow).release_id, {
      last_event: event.event,
      last_event_at: at,
      ...(receipt ? { history: withHistory((current as SubmissionRow).history, receipt) } : {}),
    });
    return finish('applied', (current as SubmissionRow).release_id);
  };
  if (status === current.status && status !== 'rejected') return stampOnly();
  // The paired rejected event for a failure we already show as needs_account.
  if (status === 'rejected' && current.status === 'needs_account' && reasons.length === 0) return stampOnly();

  // A second rejection for the same round (status_changed and delivery_failed
  // can both arrive): add only reasons not already on the plan.
  let newReasons = reasons;
  if (status === 'rejected' && current.status === 'rejected') {
    const previous = lastRejectionThisRound(current.history);
    if (previous) {
      const known = new Set(previous.reasons ?? []);
      newReasons = reasons.filter((r) => !known.has(r.text));
      if (newReasons.length === 0) return stampOnly();
    }
  }
  try {
    await applyStatus(admin, current, {
      status,
      at,
      event: event.event,
      reasons: newReasons,
      upc: event.upc,
      isrc: event.isrc,
      trmReleaseId: event.trmReleaseId,
      ...(status === 'needs_account' ? { error: TRM_ARTIST_NOT_FOUND_TEXT } : {}),
      raw: input.payload,
    });
  } catch (error) {
    // Let TRM's retry process it again: drop the dedupe row and answer 500.
    console.error('[trm] could not apply a delivery', error);
    await admin.from(DELIVERIES).delete().eq('partner', TRM_PARTNER).eq('delivery_id', deliveryId);
    return 'error';
  }
  return finish('applied', current.release_id);
}

/** A refused delivery: keep header names and a capped body to learn the shape. */
export async function recordRefusedDelivery(admin: SupabaseClient, headers: Json, rawBody: string, reason: string): Promise<void> {
  try {
    // Bounded: a flood of junk requests keeps at most 50 an hour.
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin
      .from(DELIVERIES)
      .select('delivery_id', { count: 'exact', head: true })
      .eq('partner', TRM_PARTNER)
      .eq('verified', false)
      .gte('received_at', since);
    if ((count ?? 0) >= 50) return;
    await admin.from(DELIVERIES).insert({
      partner: TRM_PARTNER,
      delivery_id: `refused:${randomUUID()}`,
      verified: false,
      outcome: `refused:${reason}`,
      headers,
      payload: { raw: rawBody.slice(0, 4000) },
    });
  } catch {
    // best effort
  }
}

export type { TrmChecklist };
