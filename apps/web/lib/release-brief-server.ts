// The database side of the release brief (URG-281). Every read and write is a
// service-role call from a route that has ALREADY passed the team access check
// (ensureReleaseTeamReadAccess / WriteAccess); the four tables carry RLS with no
// policies, so nothing here is reachable from a browser client directly.
//
// A missing table (the migration not applied yet) reads as `not_ready`, which
// the routes answer with a 503 and the scene shows as its error state, rather
// than a crash. The rules (what counts as a key date, who is on what, which
// history rows to trim) are pure and live in lib/release-brief.ts.

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import { briefButtonLine, briefProgress, type BriefFeel, type BriefFeelPatch } from '@/lib/brief-board';
import {
  BOARD_NOTES_MAX,
  isBoardCardKey,
  isNoteKey,
  noteKey,
  type BoardLayout,
} from '@/lib/brief-board-layout';
import { mayChangeBriefItem } from '@/lib/brief-media';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-constants';
import { loadCoverArtUrls } from '@/lib/cover-art';
import { isMissingTableError } from '@/lib/promo-channels';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import {
  BRIEF_BLOCKS,
  MAX_NOTES,
  MAX_REFERENCES,
  MAX_REVISIONS,
  URGANS_ACTOR_LABEL,
  canManageBriefShare,
  deriveBriefDates,
  deriveBriefPeople,
  buildBriefPlanSeed,
  firstName,
  generateShareToken,
  initialsFor,
  isBriefBlock,
  isPlausibleShareToken,
  lagosDay,
  referenceSource,
  revisionsToTrim,
  type BriefBlock,
  type BriefDecision,
  type BriefNote,
  type BriefPlanSeed,
  type BriefPayload,
  type BriefProfile,
  type BriefReference,
  type BriefRevision,
  type BriefTaskRow,
  type PublicBriefPayload,
  type ReferenceDraft,
} from '@/lib/release-brief';

export const BRIEFS_TABLE = 'release_briefs';
export const BRIEF_REFERENCES_TABLE = 'release_brief_references';
export const BRIEF_DECISIONS_TABLE = 'release_brief_decisions';
export const BRIEF_REVISIONS_TABLE = 'release_brief_revisions';
export const BRIEF_CARDS_TABLE = 'release_brief_cards';

/** Two edits to the same block by the same person this close together are one
 *  history row: the Idea autosaves as you type, and thirty "edited Idea" rows
 *  for one sitting would push everything else out of the history. */
export const REVISION_COALESCE_MS = 10 * 60 * 1000;

export type BriefFailure = { ok: false; status: number; error: string };
export type BriefResult<T> = { ok: true; value: T } | BriefFailure;

const NOT_READY: BriefFailure = { ok: false, status: 503, error: 'The brief is not set up yet.' };

function failure(error: { code?: string | null; message?: string | null } | null, fallback: string): BriefFailure {
  if (isMissingTableError(error)) return NOT_READY;
  return { ok: false, status: 500, error: error?.message || fallback };
}

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** Lagos "today" as YYYY-MM-DD. */
export function briefToday(now: Date = new Date()): string {
  return lagosDay(now.toISOString()) as string;
}

// ── Who may manage the view link ─────────────────────────────────────────────

export async function canUserManageBriefShare(
  admin: SupabaseClient,
  releaseOwnerId: string,
  user: User
): Promise<boolean> {
  if (releaseOwnerId && releaseOwnerId === user.id) return true;
  try {
    const access = await loadWorkspaceAccessContext(admin, user);
    return canManageBriefShare({
      releaseOwnerId,
      userId: user.id,
      memberRole: access.memberRoleByOwnerId[releaseOwnerId],
    });
  } catch {
    // Fail closed: not being able to read the role means no toggle.
    return false;
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

async function loadProfiles(admin: SupabaseClient, ids: string[]): Promise<BriefProfile[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const { data, error } = await admin.from('profiles').select('id,name,email').in('id', unique);
  if (error || !data) return [];
  return (data as unknown[]).map((row) => {
    const r = asRow(row);
    return { id: text(r.id), name: textOrNull(r.name), email: textOrNull(r.email) };
  });
}

function toReference(row: Record<string, unknown>): BriefReference {
  const url = text(row.url);
  return {
    id: text(row.id),
    kind: row.kind === 'image' ? 'image' : 'link',
    url,
    title: textOrNull(row.title),
    source: referenceSource(url),
    createdBy: textOrNull(row.created_by),
    createdAt: text(row.created_at),
    uploaded: Boolean(textOrNull(row.storage_path)),
  };
}

// Uploaded photos are private; each read signs them for an hour, like the cover art.
const BRIEF_IMAGE_LINK_SECONDS = 60 * 60;

async function signUploads(admin: SupabaseClient, rows: Record<string, unknown>[]): Promise<Map<string, string>> {
  const paths = rows.map((row) => textOrNull(row.storage_path)).filter((path): path is string => Boolean(path));
  if (paths.length === 0) return new Map();
  try {
    const { data } = await admin.storage.from(RELEASE_ASSETS_BUCKET).createSignedUrls(paths, BRIEF_IMAGE_LINK_SECONDS);
    return new Map(
      (data ?? [])
        .filter((item) => item.path && item.signedUrl)
        .map((item) => [item.path as string, item.signedUrl as string])
    );
  } catch {
    // A photo that cannot be signed shows as missing; the brief still loads.
    return new Map();
  }
}

type BriefRow = {
  idea: string;
  updatedBy: string | null;
  updatedAt: string | null;
  shareToken: string | null;
  shareEnabled: boolean;
  feel: BriefFeel;
};

const textList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

async function readBriefRow(admin: SupabaseClient, releaseId: string): Promise<BriefResult<BriefRow | null>> {
  const { data, error } = await admin
    .from(BRIEFS_TABLE)
    .select('idea,updated_by,updated_at,share_token,share_enabled,headline,feels_like,not_this,palette')
    .eq('release_id', releaseId)
    .maybeSingle();
  if (error) return failure(error, 'Could not load the brief.');
  if (!data) return { ok: true, value: null };
  const row = asRow(data);
  return {
    ok: true,
    value: {
      idea: text(row.idea),
      updatedBy: textOrNull(row.updated_by),
      updatedAt: textOrNull(row.updated_at),
      shareToken: textOrNull(row.share_token),
      shareEnabled: row.share_enabled === true,
      feel: {
        headline: text(row.headline),
        feelsLike: textList(row.feels_like),
        notThis: textList(row.not_this),
        palette: textList(row.palette),
      },
    },
  };
}

async function readReferences(admin: SupabaseClient, releaseId: string): Promise<BriefResult<BriefReference[]>> {
  const { data, error } = await admin
    .from(BRIEF_REFERENCES_TABLE)
    .select('id,kind,url,title,position,created_by,created_at,storage_path')
    .eq('release_id', releaseId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(MAX_REFERENCES);
  if (error) return failure(error, 'Could not load the references.');
  const rows = ((data || []) as unknown[]).map(asRow);
  const signed = await signUploads(admin, rows);
  return {
    ok: true,
    value: rows.map((row) => {
      const reference = toReference(row);
      const path = textOrNull(row.storage_path);
      return path ? { ...reference, url: signed.get(path) ?? '' } : reference;
    }),
  };
}

async function readTasks(admin: SupabaseClient, releaseId: string): Promise<BriefTaskRow[]> {
  const { data, error } = await admin
    .from('tasks')
    .select('id,title,status,due_date,assigned_to_user_id,metadata,position')
    .eq('release_id', releaseId);
  if (error || !data) return [];
  return (data as unknown[]).map((row) => {
    const r = asRow(row);
    return {
      id: text(r.id),
      title: textOrNull(r.title),
      status: textOrNull(r.status),
      due_date: textOrNull(r.due_date),
      assigned_to_user_id: textOrNull(r.assigned_to_user_id),
      metadata: r.metadata ?? null,
      position: typeof r.position === 'number' ? r.position : 0,
    };
  });
}

/**
 * The rollout's existing notes, read-only. Server-side on purpose: the Notes
 * surface itself can be switched off (its own routes 404 then), and the brief
 * still shows what was already written against this rollout.
 */
async function readNotes(admin: SupabaseClient, releaseId: string): Promise<BriefNote[]> {
  const { data, error } = await admin
    .from('notes')
    .select('id,body,created_at,archived_at')
    .eq('release_id', releaseId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_NOTES);
  if (error || !data) return [];
  return (data as unknown[])
    .map((row) => {
      const r = asRow(row);
      return { id: text(r.id), body: text(r.body).trim(), createdAt: text(r.created_at) };
    })
    .filter((note) => note.body.length > 0);
}

/**
 * What the rollout's approved plan (planner v2) already says, for an empty
 * brief to offer. Read only; any failure reads as "nothing to offer".
 */
export async function loadPlanSeed(admin: SupabaseClient, releaseId: string): Promise<BriefPlanSeed | null> {
  const [planRead, notes] = await Promise.all([
    admin
      .from('release_plan_drafts')
      .select('doc')
      .eq('release_id', releaseId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    readNotes(admin, releaseId),
  ]);
  const doc = planRead.error || !planRead.data ? null : asRow(asRow(planRead.data).doc).planner_v2;
  // The idea card's notes (newest first) read oldest first, as they were said.
  return buildBriefPlanSeed(doc, notes.map((note) => note.body).reverse());
}

export async function loadBriefPayload(
  admin: SupabaseClient,
  input: {
    releaseId: string;
    releaseOwnerId: string;
    releaseDate: string | null;
    title: string;
    artistName: string;
    artworkAssetId: string | null;
    user: User;
  }
): Promise<BriefResult<BriefPayload>> {
  const { releaseId } = input;
  const [briefRead, referencesRead, decisionsRead, revisionsRead, tasks, notes, canManageShare, planSeed, covers, board] =
    await Promise.all([
      readBriefRow(admin, releaseId),
      readReferences(admin, releaseId),
      admin
        .from(BRIEF_DECISIONS_TABLE)
        .select('id,body,created_by,created_at,source')
        .eq('release_id', releaseId)
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from(BRIEF_REVISIONS_TABLE)
        .select('id,block,actor_id,actor_label,created_at')
        .eq('release_id', releaseId)
        .order('created_at', { ascending: false })
        .limit(MAX_REVISIONS),
      readTasks(admin, releaseId),
      readNotes(admin, releaseId),
      canUserManageBriefShare(admin, input.releaseOwnerId, input.user),
      loadPlanSeed(admin, releaseId),
      // A missing cover never fails the brief; the board shows an initials tile.
      loadCoverArtUrls(admin, [{ id: releaseId, artwork_asset_id: input.artworkAssetId }], { thumbs: false }).catch(
        () => new Map<string, { url: string }>()
      ),
      readBoard(admin, releaseId),
    ]);

  if (!briefRead.ok) return briefRead;
  if (!referencesRead.ok) return referencesRead;
  if (decisionsRead.error) return failure(decisionsRead.error, 'Could not load the decisions.');
  if (revisionsRead.error) return failure(revisionsRead.error, 'Could not load the history.');

  const decisionRows = ((decisionsRead.data || []) as unknown[]).map(asRow);
  const revisionRows = ((revisionsRead.data || []) as unknown[]).map(asRow);
  const brief = briefRead.value;

  const profiles = await loadProfiles(admin, [
    ...tasks.map((task) => task.assigned_to_user_id || ''),
    ...decisionRows.map((row) => text(row.created_by)),
    ...revisionRows.map((row) => text(row.actor_id)),
    ...board.stickies.map((sticky) => sticky.createdBy || ''),
    brief?.updatedBy || '',
  ]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const nameOf = (id: string | null) => {
    const profile = id ? profileById.get(id) : undefined;
    return firstName(profile?.name, profile?.email);
  };

  const decisions: BriefDecision[] = decisionRows.map((row) => ({
    id: text(row.id),
    body: text(row.body),
    createdBy: textOrNull(row.created_by),
    authorName: nameOf(textOrNull(row.created_by)),
    createdAt: text(row.created_at),
    source: textOrNull(row.source),
  }));

  const revisions: BriefRevision[] = revisionRows
    .filter((row) => isBriefBlock(row.block))
    .map((row) => {
      const isUrgans = text(row.actor_label) === URGANS_ACTOR_LABEL;
      const actorId = textOrNull(row.actor_id);
      const profile = actorId ? profileById.get(actorId) : undefined;
      return {
        id: text(row.id),
        block: row.block as BriefBlock,
        actorName: isUrgans ? URGANS_ACTOR_LABEL : nameOf(actorId),
        initials: isUrgans ? 'U' : initialsFor(profile?.name, profile?.email),
        isUrgans,
        createdAt: text(row.created_at),
      };
    });

  // "Edited by" is the newest history row, so an UrgAns draft that was kept
  // reads "Edited by UrgAns" exactly as the history does.
  const latest = revisions[0];
  const today = briefToday();

  return {
    ok: true,
    value: {
      releaseId,
      idea: brief?.idea ?? '',
      updatedAt: latest?.createdAt ?? brief?.updatedAt ?? null,
      updatedByName: latest?.actorName ?? (brief?.updatedBy ? nameOf(brief.updatedBy) : null),
      references: referencesRead.value,
      decisions,
      dates: deriveBriefDates({ tasks, releaseDate: input.releaseDate, today }),
      people: deriveBriefPeople({ tasks, profiles }),
      notes,
      revisions,
      planSeed,
      share: { enabled: brief?.shareEnabled ?? false, token: brief?.shareEnabled ? brief.shareToken : null },
      viewer: { id: input.user.id, canEdit: true, canManageShare },
      board: {
        title: input.title || 'Untitled',
        artistName: input.artistName,
        coverUrl: covers.get(releaseId)?.url ?? null,
        releaseDate: input.releaseDate,
        today,
        progress: briefProgress(tasks, today),
        feel: brief?.feel ?? { headline: '', feelsLike: [], notThis: [], palette: [] },
        layout: board.layout,
        canArrange: canManageShare,
        stickies: board.stickies.map((sticky) => ({ ...sticky, authorName: nameOf(sticky.createdBy) })),
      },
    },
  };
}

// ── History ──────────────────────────────────────────────────────────────────

/**
 * Record one edit, then trim the rollout's history to the newest 30. Best
 * effort by contract: the edit itself already saved, and a failed history
 * write must not turn a saved edit into an error.
 */
export async function recordBriefRevision(
  admin: SupabaseClient,
  input: { releaseId: string; block: BriefBlock; actorId: string | null; actorLabel?: string | null }
): Promise<void> {
  if (!(BRIEF_BLOCKS as readonly string[]).includes(input.block)) return;
  try {
    const label = input.actorLabel ?? null;
    // Coalesce an autosave burst: same block, same person, a few minutes apart.
    const { data: latest } = await admin
      .from(BRIEF_REVISIONS_TABLE)
      .select('id,block,actor_id,actor_label,created_at')
      .eq('release_id', input.releaseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = latest ? asRow(latest) : null;
    const now = new Date();
    if (
      last &&
      last.block === input.block &&
      (textOrNull(last.actor_id) ?? null) === input.actorId &&
      (textOrNull(last.actor_label) ?? null) === label &&
      now.getTime() - new Date(text(last.created_at)).getTime() < REVISION_COALESCE_MS
    ) {
      await admin.from(BRIEF_REVISIONS_TABLE).update({ created_at: now.toISOString() }).eq('id', text(last.id));
      return;
    }

    await admin.from(BRIEF_REVISIONS_TABLE).insert({
      release_id: input.releaseId,
      block: input.block,
      actor_id: input.actorId,
      actor_label: label,
    });

    const { data: rows } = await admin
      .from(BRIEF_REVISIONS_TABLE)
      .select('id,created_at')
      .eq('release_id', input.releaseId)
      .order('created_at', { ascending: false })
      .limit(MAX_REVISIONS + 20);
    const stale = revisionsToTrim(
      ((rows || []) as unknown[]).map((row) => {
        const r = asRow(row);
        return { id: text(r.id), created_at: text(r.created_at) };
      })
    );
    if (stale.length > 0) {
      await admin.from(BRIEF_REVISIONS_TABLE).delete().in('id', stale);
    }
  } catch {
    // See the docstring: history is best effort.
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function saveBriefIdea(
  admin: SupabaseClient,
  input: { releaseId: string; idea: string; actorId: string; actorLabel?: string | null }
): Promise<BriefResult<{ idea: string; updatedAt: string }>> {
  const updatedAt = new Date().toISOString();
  const { error } = await admin.from(BRIEFS_TABLE).upsert(
    { release_id: input.releaseId, idea: input.idea, updated_by: input.actorId, updated_at: updatedAt },
    { onConflict: 'release_id' }
  );
  if (error) return failure(error, 'Could not save the idea.');
  await recordBriefRevision(admin, {
    releaseId: input.releaseId,
    block: 'idea',
    actorId: input.actorId,
    actorLabel: input.actorLabel ?? null,
  });
  return { ok: true, value: { idea: input.idea, updatedAt } };
}

/** Save any of the board's look-and-feel fields (#897). History reads "Look and feel". */
export async function saveBriefFeel(
  admin: SupabaseClient,
  input: { releaseId: string; patch: BriefFeelPatch; actorId: string }
): Promise<BriefResult<BriefFeelPatch>> {
  const row: Record<string, unknown> = {
    release_id: input.releaseId,
    updated_by: input.actorId,
    updated_at: new Date().toISOString(),
  };
  if (input.patch.headline !== undefined) row.headline = input.patch.headline;
  if (input.patch.feelsLike !== undefined) row.feels_like = input.patch.feelsLike;
  if (input.patch.notThis !== undefined) row.not_this = input.patch.notThis;
  if (input.patch.palette !== undefined) row.palette = input.patch.palette;
  const { error } = await admin.from(BRIEFS_TABLE).upsert(row, { onConflict: 'release_id' });
  if (error) return failure(error, 'Could not save the look and feel.');
  await recordBriefRevision(admin, { releaseId: input.releaseId, block: 'feel', actorId: input.actorId });
  return { ok: true, value: input.patch };
}

// ── The plan's Brief button (#902) ─────────────────────────────────────────

/** Just enough for the plan's Brief button: the line under the word, and whether anything is written. */
export async function loadBriefSummary(
  admin: SupabaseClient,
  releaseId: string
): Promise<BriefResult<{ line: string; written: boolean }>> {
  const { data, error } = await admin
    .from(BRIEFS_TABLE)
    .select('idea,headline')
    .eq('release_id', releaseId)
    .maybeSingle();
  if (error) return failure(error, 'Could not load the brief.');
  const row = data ? asRow(data) : {};
  const line = briefButtonLine({ headline: text(row.headline), idea: text(row.idea) });
  return { ok: true, value: { line, written: line.length > 0 } };
}

// ── Board layout (#897 phase 1b) ────────────────────────────────────────────

type StickyRow = { id: string; key: ReturnType<typeof noteKey>; text: string; createdBy: string | null };

/**
 * The stored card places (null when nothing is stored, so the board uses the
 * default) and the sticky notes, oldest first. A failed read shows the default
 * board with no notes.
 */
async function readBoard(
  admin: SupabaseClient,
  releaseId: string
): Promise<{ layout: BoardLayout | null; stickies: StickyRow[] }> {
  const { data, error } = await admin
    .from(BRIEF_CARDS_TABLE)
    .select('id,card_key,kind,x,y,w,h,payload,created_by,created_at')
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true });
  if (error || !data || data.length === 0) return { layout: null, stickies: [] };
  const layout: BoardLayout = {};
  const stickies: StickyRow[] = [];
  for (const row of (data as unknown[]).map(asRow)) {
    const key = row.card_key;
    if (!isBoardCardKey(key) && !isNoteKey(key)) continue;
    layout[key] = { x: Number(row.x), y: Number(row.y), w: Number(row.w), h: Number(row.h) };
    if (isNoteKey(key)) {
      const payload = (row.payload ?? {}) as { text?: unknown };
      stickies.push({ id: text(row.id), key, text: text(payload.text), createdBy: textOrNull(row.created_by) });
    }
  }
  return { layout: Object.keys(layout).length ? layout : null, stickies };
}

/** Save the whole board in one upsert, so a push-down never leaves half the cards moved. */
export async function saveBoardLayout(
  admin: SupabaseClient,
  input: { releaseId: string; layout: BoardLayout; actorId: string }
): Promise<BriefResult<BoardLayout>> {
  // A note in the layout must still exist: a move saved after someone deleted
  // the note would otherwise bring it back empty.
  const { data: noteRows, error: noteError } = await admin
    .from(BRIEF_CARDS_TABLE)
    .select('card_key')
    .eq('release_id', input.releaseId)
    .eq('kind', 'note');
  if (noteError) return failure(noteError, 'Could not save the board.');
  const liveNotes = new Set(((noteRows || []) as unknown[]).map((row) => text(asRow(row).card_key)));
  // Only the place is written: a note keeps its text and its author.
  const rows = (Object.keys(input.layout) as (keyof BoardLayout)[])
    .filter((key) => isBoardCardKey(key) || liveNotes.has(key))
    .map((key) => ({
      release_id: input.releaseId,
      card_key: key,
      kind: isNoteKey(key) ? 'note' : key,
      ...input.layout[key]!,
    }));
  if (rows.length === 0) return { ok: true, value: input.layout };
  const { error } = await admin.from(BRIEF_CARDS_TABLE).upsert(rows, { onConflict: 'release_id,card_key' });
  if (error) return failure(error, 'Could not save the board.');
  return { ok: true, value: input.layout };
}

/** Back to the default layout. Notes (phase 2) keep their rows. */
export async function resetBoardLayout(admin: SupabaseClient, releaseId: string): Promise<BriefResult<null>> {
  const { error } = await admin.from(BRIEF_CARDS_TABLE).delete().eq('release_id', releaseId).neq('kind', 'note');
  if (error) return failure(error, 'Could not reset the board.');
  return { ok: true, value: null };
}

// ── Sticky notes (#897 phase 2) ─────────────────────────────────────────────

/** Add a note at the bottom of the board. Anyone on the team who can edit. */
export async function addBriefSticky(
  admin: SupabaseClient,
  input: { releaseId: string; text: string; actorId: string }
): Promise<BriefResult<StickyRow>> {
  const { count, error: countError } = await admin
    .from(BRIEF_CARDS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('release_id', input.releaseId)
    .eq('kind', 'note');
  if (countError) return failure(countError, 'Could not add the note.');
  if ((count ?? 0) >= BOARD_NOTES_MAX) {
    return { ok: false, status: 400, error: `A brief holds up to ${BOARD_NOTES_MAX} notes.` };
  }
  const id = crypto.randomUUID();
  const key = noteKey(id);
  // y 200 is the floor: the board settles a new note up to the first free row.
  const { error } = await admin.from(BRIEF_CARDS_TABLE).insert({
    id,
    release_id: input.releaseId,
    card_key: key,
    kind: 'note',
    x: 1,
    y: 200,
    w: 3,
    h: 1,
    payload: { text: input.text },
    created_by: input.actorId,
  });
  if (error) return failure(error, 'Could not add the note.');
  return { ok: true, value: { id, key, text: input.text, createdBy: input.actorId } };
}

async function ownedSticky(
  admin: SupabaseClient,
  input: { releaseId: string; noteId: string; user: User; releaseOwnerId: string }
): Promise<BriefResult<null>> {
  const { data, error } = await admin
    .from(BRIEF_CARDS_TABLE)
    .select('id,release_id,kind,created_by')
    .eq('id', input.noteId)
    .maybeSingle();
  if (error) return failure(error, 'Could not find the note.');
  const row = data ? asRow(data) : null;
  if (!row || text(row.release_id) !== input.releaseId || row.kind !== 'note') {
    return { ok: false, status: 404, error: 'Not found.' };
  }
  const own = text(row.created_by) === input.user.id;
  const isLead = own ? false : await canUserManageBriefShare(admin, input.releaseOwnerId, input.user);
  if (!mayChangeBriefItem({ createdBy: textOrNull(row.created_by), userId: input.user.id, isLead })) {
    return { ok: false, status: 403, error: 'Only the person who wrote the note can change it.' };
  }
  return { ok: true, value: null };
}

export async function setBriefStickyText(
  admin: SupabaseClient,
  input: { releaseId: string; noteId: string; text: string; user: User; releaseOwnerId: string }
): Promise<BriefResult<{ id: string; text: string }>> {
  const allowed = await ownedSticky(admin, input);
  if (!allowed.ok) return allowed;
  const { error } = await admin.from(BRIEF_CARDS_TABLE).update({ payload: { text: input.text } }).eq('id', input.noteId);
  if (error) return failure(error, 'Could not save the note.');
  return { ok: true, value: { id: input.noteId, text: input.text } };
}

export async function deleteBriefSticky(
  admin: SupabaseClient,
  input: { releaseId: string; noteId: string; user: User; releaseOwnerId: string }
): Promise<BriefResult<{ id: string }>> {
  const allowed = await ownedSticky(admin, input);
  if (!allowed.ok) return allowed;
  const { error } = await admin.from(BRIEF_CARDS_TABLE).delete().eq('id', input.noteId);
  if (error) return failure(error, 'Could not remove the note.');
  return { ok: true, value: { id: input.noteId } };
}

export async function addBriefReference(
  admin: SupabaseClient,
  input: { releaseId: string; draft: ReferenceDraft; actorId: string }
): Promise<BriefResult<BriefReference>> {
  const { count, error: countError } = await admin
    .from(BRIEF_REFERENCES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('release_id', input.releaseId);
  if (countError) return failure(countError, 'Could not add the reference.');
  if ((count ?? 0) >= MAX_REFERENCES) {
    return { ok: false, status: 400, error: `A brief holds up to ${MAX_REFERENCES} references.` };
  }
  const { data, error } = await admin
    .from(BRIEF_REFERENCES_TABLE)
    .insert({
      release_id: input.releaseId,
      kind: input.draft.kind,
      url: input.draft.url,
      title: input.draft.title,
      storage_path: input.draft.storagePath ?? null,
      position: count ?? 0,
      created_by: input.actorId,
    })
    .select('id,kind,url,title,position,created_by,created_at,storage_path')
    .single();
  if (error || !data) return failure(error, 'Could not add the reference.');
  await recordBriefRevision(admin, { releaseId: input.releaseId, block: 'references', actorId: input.actorId });
  const row = asRow(data);
  const signed = await signUploads(admin, [row]);
  const reference = toReference(row);
  const path = textOrNull(row.storage_path);
  return { ok: true, value: path ? { ...reference, url: signed.get(path) ?? '' } : reference };
}

/**
 * Delete a reference or a decision. Anyone who wrote it may delete it; the
 * rollout's owner and team admins may delete any (requirement 2: "delete own,
 * owner can delete any").
 */
async function deleteOwnedRow(
  admin: SupabaseClient,
  input: {
    table: string;
    block: BriefBlock;
    releaseId: string;
    rowId: string;
    user: User;
    releaseOwnerId: string;
  }
): Promise<BriefResult<{ id: string }>> {
  const { data, error } = await admin
    .from(input.table)
    .select('id,release_id,created_by')
    .eq('id', input.rowId)
    .maybeSingle();
  if (error) return failure(error, 'Could not delete that.');
  const row = data ? asRow(data) : null;
  if (!row || text(row.release_id) !== input.releaseId) {
    return { ok: false, status: 404, error: 'Not found.' };
  }
  if (text(row.created_by) !== input.user.id) {
    const manager = await canUserManageBriefShare(admin, input.releaseOwnerId, input.user);
    if (!manager) return { ok: false, status: 403, error: 'Only the person who added it can remove it.' };
  }
  const { error: deleteError } = await admin.from(input.table).delete().eq('id', input.rowId);
  if (deleteError) return failure(deleteError, 'Could not delete that.');
  await recordBriefRevision(admin, { releaseId: input.releaseId, block: input.block, actorId: input.user.id });
  return { ok: true, value: { id: input.rowId } };
}

export async function deleteBriefReference(
  admin: SupabaseClient,
  input: { releaseId: string; rowId: string; user: User; releaseOwnerId: string }
) {
  const { data } = await admin.from(BRIEF_REFERENCES_TABLE).select('storage_path').eq('id', input.rowId).maybeSingle();
  const path = data ? textOrNull(asRow(data).storage_path) : null;
  const deleted = await deleteOwnedRow(admin, { ...input, table: BRIEF_REFERENCES_TABLE, block: 'references' });
  // The photo goes with its row. Best effort: a file left behind costs storage, not correctness.
  if (deleted.ok && path) await admin.storage.from(RELEASE_ASSETS_BUCKET).remove([path]).catch(() => undefined);
  return deleted;
}

/** Change a picture's or link's caption: whoever added it, or a lead. */
export async function setBriefReferenceCaption(
  admin: SupabaseClient,
  input: { releaseId: string; rowId: string; caption: string; user: User; releaseOwnerId: string }
): Promise<BriefResult<{ id: string; title: string | null }>> {
  const { data, error } = await admin
    .from(BRIEF_REFERENCES_TABLE)
    .select('id,release_id,created_by')
    .eq('id', input.rowId)
    .maybeSingle();
  if (error) return failure(error, 'Could not save the caption.');
  const row = data ? asRow(data) : null;
  if (!row || text(row.release_id) !== input.releaseId) return { ok: false, status: 404, error: 'Not found.' };
  const isLead = text(row.created_by) === input.user.id ? false : await canUserManageBriefShare(admin, input.releaseOwnerId, input.user);
  if (!mayChangeBriefItem({ createdBy: textOrNull(row.created_by), userId: input.user.id, isLead })) {
    return { ok: false, status: 403, error: 'Only the person who added it can change the caption.' };
  }
  const title = input.caption || null;
  const { error: updateError } = await admin.from(BRIEF_REFERENCES_TABLE).update({ title }).eq('id', input.rowId);
  if (updateError) return failure(updateError, 'Could not save the caption.');
  await recordBriefRevision(admin, { releaseId: input.releaseId, block: 'references', actorId: input.user.id });
  return { ok: true, value: { id: input.rowId, title } };
}

export function deleteBriefDecision(
  admin: SupabaseClient,
  input: { releaseId: string; rowId: string; user: User; releaseOwnerId: string }
) {
  return deleteOwnedRow(admin, { ...input, table: BRIEF_DECISIONS_TABLE, block: 'decisions' });
}

export async function addBriefDecision(
  admin: SupabaseClient,
  input: { releaseId: string; body: string; actorId: string }
): Promise<BriefResult<{ id: string; body: string; createdBy: string; createdAt: string }>> {
  const { data, error } = await admin
    .from(BRIEF_DECISIONS_TABLE)
    .insert({ release_id: input.releaseId, body: input.body, created_by: input.actorId })
    .select('id,body,created_by,created_at')
    .single();
  if (error || !data) return failure(error, 'Could not add the decision.');
  await recordBriefRevision(admin, { releaseId: input.releaseId, block: 'decisions', actorId: input.actorId });
  const row = asRow(data);
  return {
    ok: true,
    value: { id: text(row.id), body: text(row.body), createdBy: input.actorId, createdAt: text(row.created_at) },
  };
}

/**
 * Turn the view link on or off. Turning it on keeps the token it had before, so
 * a link someone already holds starts working again; a fresh token is minted
 * only the first time. Not a history entry: it changes who can read, not what
 * the brief says.
 */
export async function setBriefShare(
  admin: SupabaseClient,
  input: { releaseId: string; enabled: boolean; actorId: string }
): Promise<BriefResult<{ enabled: boolean; token: string | null }>> {
  const current = await readBriefRow(admin, input.releaseId);
  if (!current.ok) return current;
  const token = current.value?.shareToken || generateShareToken();
  if (current.value) {
    const { error } = await admin
      .from(BRIEFS_TABLE)
      .update({ share_enabled: input.enabled, share_token: token })
      .eq('release_id', input.releaseId);
    if (error) return failure(error, 'Could not change the view link.');
  } else {
    const { error } = await admin.from(BRIEFS_TABLE).insert({
      release_id: input.releaseId,
      share_enabled: input.enabled,
      share_token: token,
      updated_by: input.actorId,
    });
    if (error) return failure(error, 'Could not change the view link.');
  }
  return { ok: true, value: { enabled: input.enabled, token: input.enabled ? token : null } };
}

// ── The public view link ─────────────────────────────────────────────────────

function publicAdminClient(): SupabaseClient | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * What /brief/[token] shows, or null for anything that should read as "this
 * link isn't available": an unknown token, a link switched off, the feature
 * switched off, the tables not there yet, or an archived rollout. The page
 * never says which, so a guess learns nothing.
 */
export async function loadPublicBrief(token: string): Promise<PublicBriefPayload | null> {
  if (process.env.NEXT_PUBLIC_FEATURE_RELEASE_BRIEF === 'false') return null;
  if (!isPlausibleShareToken(token)) return null;
  try {
    const admin = publicAdminClient();
    if (!admin) return null;
    const { data, error } = await admin
      .from(BRIEFS_TABLE)
      .select('release_id,idea,share_enabled')
      .eq('share_token', token)
      .maybeSingle();
    if (error || !data) return null;
    const brief = asRow(data);
    if (brief.share_enabled !== true) return null;
    const releaseId = text(brief.release_id);

    const [releaseResult, referencesRead, tasks] = await Promise.all([
      admin
        .from('releases')
        .select('id,title,artist_name,release_date,archived_at')
        .eq('id', releaseId)
        .is('deleted_at', null)
        .maybeSingle(),
      readReferences(admin, releaseId),
      readTasks(admin, releaseId),
    ]);
    const release = releaseResult.data ? asRow(releaseResult.data) : null;
    if (!release || release.archived_at) return null;
    const releaseDate = textOrNull(release.release_date);

    return {
      artistName: text(release.artist_name),
      title: text(release.title) || 'Untitled',
      releaseDate,
      idea: text(brief.idea),
      references: referencesRead.ok ? referencesRead.value : [],
      dates: deriveBriefDates({ tasks, releaseDate, today: briefToday() }),
    };
  } catch {
    return null;
  }
}
