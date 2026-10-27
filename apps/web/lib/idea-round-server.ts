// SERVER ONLY. The database half of the idea round and the brief approval
// (2026-10-27). Pure rules are in lib/idea-round.ts. Every function here runs
// from a route that has ALREADY passed the team access check; the columns live
// on release_briefs (20261027120000_idea_round_and_brief_approval.sql).

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { RELEASE_ASSETS_BUCKET } from '@/lib/asset-constants';
import { loadProfilesByIds } from '@/lib/tasks-server';
import type { BriefIdea, BriefRound } from '@/lib/release-brief';
import {
  briefToPlanNotes,
  canRunIdeaRound,
  effectiveRoundState,
  ideaRoundState,
  visibleIdeaNotes,
  isIdeaRoundEnabled,
  parseToSettle,
  planGate,
  settledDecisionBody,
  IDEA_ROUND_COPY,
  type IdeaRoundState,
  type ToSettleItem,
} from '@/lib/idea-round';
import {
  BRIEF_DECISIONS_TABLE,
  BRIEFS_TABLE,
  canUserManageBriefShare,
  recordBriefRevision,
  type BriefFailure,
  type BriefResult,
} from '@/lib/release-brief-server';
import { IDEAS_TABLE, loadIdeaNotes } from '@/lib/rollout-ideas-server';

export type IdeaRound = {
  state: IdeaRoundState;
  ideasClosedAt: string | null;
  askedIds: string[];
  toSettle: ToSettleItem[];
  approvedAt: string | null;
  approvedBy: string | null;
  approvedVersion: number;
  idea: string;
};

const EMPTY_ROUND: IdeaRound = {
  state: 'open',
  ideasClosedAt: null,
  askedIds: [],
  toSettle: [],
  approvedAt: null,
  approvedBy: null,
  approvedVersion: 0,
  idea: '',
};

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

const fail = (status: number, error: string): BriefFailure => ({ ok: false, status, error });

/** The rollout's round. A rollout with no brief row yet is an open round. */
export async function readIdeaRound(admin: SupabaseClient, releaseId: string): Promise<BriefResult<IdeaRound>> {
  const { data, error } = await admin
    .from(BRIEFS_TABLE)
    .select('idea,ideas_closed_at,ideas_asked_ids,to_settle,approved_at,approved_by,approved_version')
    .eq('release_id', releaseId)
    .maybeSingle();
  if (error) return fail(500, error.message || 'Could not read the round.');
  if (!data) return { ok: true, value: EMPTY_ROUND };
  const row = asRow(data);
  const ideasClosedAt = textOrNull(row.ideas_closed_at);
  const approvedAt = textOrNull(row.approved_at);
  return {
    ok: true,
    value: {
      state: ideaRoundState({ ideasClosedAt, approvedAt }),
      ideasClosedAt,
      askedIds: Array.isArray(row.ideas_asked_ids) ? (row.ideas_asked_ids as unknown[]).map(String) : [],
      toSettle: parseToSettle(row.to_settle),
      approvedAt,
      approvedBy: textOrNull(row.approved_by),
      approvedVersion: typeof row.approved_version === 'number' ? row.approved_version : 0,
      idea: typeof row.idea === 'string' ? row.idea : '',
    },
  };
}

/** The rollout owner, or a team owner or admin. */
export async function canUserRunIdeaRound(admin: SupabaseClient, releaseOwnerId: string, user: User): Promise<boolean> {
  if (user.id === releaseOwnerId) return true;
  const isTeamAdmin = await canUserManageBriefShare(admin, releaseOwnerId, user);
  return canRunIdeaRound({ viewerId: user.id, releaseOwnerId, isTeamAdmin });
}

async function upsertRound(admin: SupabaseClient, releaseId: string, values: Record<string, unknown>): Promise<BriefResult<null>> {
  const { error } = await admin.from(BRIEFS_TABLE).upsert({ release_id: releaseId, ...values }, { onConflict: 'release_id' });
  if (error) return fail(500, error.message || 'Could not save the round.');
  return { ok: true, value: null };
}

/** Add people to the round's "asked" list (a union; asking twice changes nothing). */
export async function recordIdeasAsked(admin: SupabaseClient, releaseId: string, userIds: string[]): Promise<void> {
  try {
    const round = await readIdeaRound(admin, releaseId);
    if (!round.ok || round.value.state !== 'open') return;
    const asked = [...new Set([...round.value.askedIds, ...userIds.filter(Boolean)])];
    await upsertRound(admin, releaseId, { ideas_asked_ids: asked });
  } catch {
    // Only the "everyone is in" close depends on this; the ask itself was sent.
  }
}

/** Close the round. `actorId` null means it closed by itself (everyone asked is in). */
export async function closeIdeaRound(
  admin: SupabaseClient,
  releaseId: string,
  actorId: string | null
): Promise<BriefResult<IdeaRound>> {
  const round = await readIdeaRound(admin, releaseId);
  if (!round.ok) return round;
  if (round.value.state !== 'open') return round;
  const closedAt = new Date().toISOString();
  const saved = await upsertRound(admin, releaseId, { ideas_closed_at: closedAt, ideas_closed_by: actorId });
  if (!saved.ok) return saved;
  return { ok: true, value: { ...round.value, state: 'closed', ideasClosedAt: closedAt } };
}

/** Refuse a brief edit while the brief is approved. Null when the edit may go ahead. */
export async function briefLockedFailure(admin: SupabaseClient, releaseId: string): Promise<BriefFailure | null> {
  if (!isIdeaRoundEnabled()) return null;
  const round = await readIdeaRound(admin, releaseId);
  if (!round.ok) return null;
  return round.value.state === 'approved' ? fail(409, IDEA_ROUND_COPY.approved) : null;
}

/** Pick one side of a disagreement: it becomes a decision, and the question leaves the list. */
export async function settleBriefItem(
  admin: SupabaseClient,
  input: { releaseId: string; itemId: string; optionIndex: number; actorId: string }
): Promise<BriefResult<{ toSettle: ToSettleItem[] }>> {
  const round = await readIdeaRound(admin, input.releaseId);
  if (!round.ok) return round;
  if (round.value.state === 'approved') return fail(409, IDEA_ROUND_COPY.approved);
  const item = round.value.toSettle.find((entry) => entry.id === input.itemId);
  if (!item) return fail(404, 'That question was already settled.');
  const body = settledDecisionBody(item, input.optionIndex);
  if (!body) return fail(400, 'Pick one of the options.');

  const { error } = await admin
    .from(BRIEF_DECISIONS_TABLE)
    .insert({ release_id: input.releaseId, body, created_by: input.actorId });
  if (error) return fail(500, error.message || 'Could not save that.');
  const rest = round.value.toSettle.filter((entry) => entry.id !== input.itemId);
  const saved = await upsertRound(admin, input.releaseId, { to_settle: rest });
  if (!saved.ok) return saved;
  await recordBriefRevision(admin, { releaseId: input.releaseId, block: 'decisions', actorId: input.actorId });
  return { ok: true, value: { toSettle: rest } };
}

/** Lock the brief. The plan is built from it next. */
export async function approveBrief(
  admin: SupabaseClient,
  input: { releaseId: string; actorId: string }
): Promise<BriefResult<IdeaRound>> {
  const round = await readIdeaRound(admin, input.releaseId);
  if (!round.ok) return round;
  if (round.value.state === 'approved') return round;
  if (!round.value.idea.trim()) return fail(400, 'Write the idea first.');
  const approvedAt = new Date().toISOString();
  const version = round.value.approvedVersion + 1;
  const saved = await upsertRound(admin, input.releaseId, {
    approved_at: approvedAt,
    approved_by: input.actorId,
    approved_version: version,
    // Approving a brief that came straight from the page (no round) closes the round too.
    ...(round.value.ideasClosedAt ? {} : { ideas_closed_at: approvedAt, ideas_closed_by: input.actorId }),
  });
  if (!saved.ok) return saved;
  await admin
    .from('release_brief_revisions')
    .insert({ release_id: input.releaseId, block: 'approved', actor_id: input.actorId, actor_label: null })
    .then(
      () => undefined,
      () => undefined
    );
  return {
    ok: true,
    value: {
      ...round.value,
      state: 'approved',
      approvedAt,
      approvedBy: input.actorId,
      approvedVersion: version,
      ideasClosedAt: round.value.ideasClosedAt ?? approvedAt,
    },
  };
}

/** Unlock the brief for a new version. Tasks already built are never touched. */
export async function startNewBriefVersion(admin: SupabaseClient, releaseId: string): Promise<BriefResult<IdeaRound>> {
  const round = await readIdeaRound(admin, releaseId);
  if (!round.ok) return round;
  if (round.value.state !== 'approved') return round;
  const saved = await upsertRound(admin, releaseId, { approved_at: null, approved_by: null });
  if (!saved.ok) return saved;
  return { ok: true, value: { ...round.value, state: 'closed', approvedAt: null, approvedBy: null } };
}

/** The rollout already has a built plan (an approved planner draft). */
export async function rolloutHasBuiltPlan(admin: SupabaseClient, releaseId: string): Promise<boolean> {
  const { count, error } = await admin
    .from('release_plan_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('release_id', releaseId)
    .eq('status', 'approved');
  return !error && (count ?? 0) > 0;
}

async function rolloutHasIdeas(admin: SupabaseClient, releaseId: string): Promise<boolean> {
  const { count, error } = await admin
    .from(IDEAS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('release_id', releaseId);
  return !error && (count ?? 0) > 0;
}

/**
 * What the planner may use. 'free': no ideas, today's planner as it was.
 * 'needs_approval': refuse. 'from_brief': build, with `notes` (the approved
 * brief) replacing whatever notes the browser sent.
 */
export async function planInputFor(
  admin: SupabaseClient,
  releaseId: string
): Promise<{ gate: 'free' } | { gate: 'needs_approval' } | { gate: 'from_brief'; notes: string }> {
  if (!isIdeaRoundEnabled()) return { gate: 'free' };
  const [hasIdeas, round] = await Promise.all([rolloutHasIdeas(admin, releaseId), readIdeaRound(admin, releaseId)]);
  if (!round.ok) return { gate: 'free' };
  const gate = planGate({ hasIdeas, state: round.value.state });
  // A rollout planned before the round existed keeps planning as it did.
  if (gate === 'needs_approval') return (await rolloutHasBuiltPlan(admin, releaseId)) ? { gate: 'free' } : { gate };
  if (gate !== 'from_brief') return { gate };
  const { data } = await admin
    .from(BRIEF_DECISIONS_TABLE)
    .select('body')
    .eq('release_id', releaseId)
    .order('created_at', { ascending: true })
    .limit(40);
  const decisions = ((data || []) as Array<{ body?: unknown }>).map((row) => ({ body: String(row.body ?? '') }));
  return { gate, notes: briefToPlanNotes({ idea: round.value.idea, decisions, toSettle: round.value.toSettle }) };
}

/**
 * What the brief page adds for the round: its state, the open questions, who
 * approved it, and the ideas (all of them for the owner; for a teammate only
 * once the round is closed). Null round with the flag off.
 */
export async function loadBriefRoundExtras(
  admin: SupabaseClient,
  input: { releaseId: string; releaseOwnerId: string; user: User }
): Promise<{ round: BriefRound | null; ideas: BriefIdea[] }> {
  if (!isIdeaRoundEnabled()) return { round: null, ideas: [] };
  const [roundRead, canRun, hasPlan] = await Promise.all([
    readIdeaRound(admin, input.releaseId),
    canUserRunIdeaRound(admin, input.releaseOwnerId, input.user),
    rolloutHasBuiltPlan(admin, input.releaseId),
  ]);
  if (!roundRead.ok) return { round: null, ideas: [] };
  const round = roundRead.value;
  const state = effectiveRoundState(round.state, hasPlan);
  let ideas: BriefIdea[] = [];
  try {
    const notes = await loadIdeaNotes(admin, input.releaseId, input.user.id);
    const visible = visibleIdeaNotes(notes, { state, viewerId: input.user.id, seeAll: canRun });
    ideas = (await withAudioUrls(admin, visible)).map((note) => ({
      id: note.id,
      authorName: note.isOwn ? 'You' : note.authorName,
      initials: note.authorInitials,
      content: note.content,
      audioUrl: note.audioUrl,
      audioSeconds: note.audioSeconds ?? null,
    }));
  } catch {
    // The brief still reads without the ideas list.
  }
  const approver = round.approvedBy ? (await loadProfilesByIds(admin, [round.approvedBy])).get(round.approvedBy) : null;
  return {
    round: {
      state: round.state,
      toSettle: round.toSettle,
      approvedAt: round.approvedAt,
      approvedByName: approver ? String(approver.name || '').trim().split(/\s+/)[0] || null : null,
      version: round.approvedVersion,
      canRun,
    },
    ideas,
  };
}

/** Signed links for kept voice clips, one batch call, an hour long. */
export async function signIdeaAudio(admin: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  try {
    const { data } = await admin.storage.from(RELEASE_ASSETS_BUCKET).createSignedUrls(unique, 60 * 60);
    for (const entry of data || []) {
      if (entry.path && entry.signedUrl) out.set(entry.path, entry.signedUrl);
    }
  } catch {
    // The words still show; only the play button is missing.
  }
  return out;
}

/** Notes as the browser gets them: the clip's storage path swapped for a signed link. */
export async function withAudioUrls<T extends { audioPath: string | null }>(
  admin: SupabaseClient,
  notes: T[]
): Promise<Array<Omit<T, 'audioPath'> & { audioUrl: string | null }>> {
  const signed = await signIdeaAudio(
    admin,
    notes.map((note) => note.audioPath || '')
  );
  return notes.map(({ audioPath, ...note }) => ({
    ...note,
    audioUrl: audioPath ? signed.get(audioPath) ?? null : null,
  }));
}

/** Keep a voice clip. Returns its path, or null when it could not be stored (the words still save). */
export async function storeIdeaAudio(
  admin: SupabaseClient,
  input: { path: string; file: File }
): Promise<string | null> {
  try {
    const { error } = await admin.storage.from(RELEASE_ASSETS_BUCKET).upload(input.path, input.file, {
      contentType: input.file.type || 'audio/webm',
      upsert: false,
    });
    return error ? null : input.path;
  } catch {
    return null;
  }
}
