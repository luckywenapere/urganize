import { NextRequest, NextResponse } from 'next/server';
import { afterResponse } from '@/lib/after-response';
import { getTranscriptionConfig } from '@/lib/chappi/config';
import { MAX_IDEA_LENGTH } from '@/lib/rollout-ideas';
import {
  askedInCount,
  effectiveRoundState,
  everyoneAskedIsIn,
  isIdeaRoundEnabled,
  isOwnIdeaAudioPath,
  visibleIdeaNotes,
} from '@/lib/idea-round';
import {
  canUserRunIdeaRound,
  closeIdeaRound,
  readIdeaRound,
  rolloutHasBuiltPlan,
  withAudioUrls,
} from '@/lib/idea-round-server';
import {
  IDEAS_TABLE,
  loadIdeaNotes,
  loadIdeasPeople,
  notifyIdeaAdded,
  toIdeasPeoplePayload,
} from '@/lib/rollout-ideas-server';
import { loadProfilesByIds } from '@/lib/tasks-server';
import {
  createAdminClient,
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
  ideasEnabled,
  notFoundResponse,
  requireActiveAuthenticatedUser,
  toIdeasRelease,
} from './_shared';

/**
 * A rollout's ideas (2026-10-26): GET every note plus who else is on the
 * rollout (for "Who should chime in?"), POST a new note.
 *
 * Notes are rows in release_messages. A new note pushes everyone else on the
 * rollout and emails the owner, after the reply (afterResponse), and never
 * fails the save.
 *
 * The idea round (2026-10-27, lib/idea-round.ts): while it is open a teammate
 * reads only their own notes and a new note reaches only the owner; the owner
 * and team admins read them all. A spoken note keeps its clip (audioPath from
 * the transcribe route). Once everyone asked has added one, the round closes
 * by itself. A rollout planned before the round existed reads as closed.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!ideasEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;
  const release = toIdeasRelease(access.release);

  try {
    const roundOn = isIdeaRoundEnabled();
    const [allNotes, people, ownerProfiles, roundRead, canRun, hasPlan] = await Promise.all([
      loadIdeaNotes(adminClient, releaseId, auth.user.id),
      loadIdeasPeople(adminClient, release),
      loadProfilesByIds(adminClient, [release.ownerUserId]),
      roundOn ? readIdeaRound(adminClient, releaseId) : Promise.resolve(null),
      roundOn ? canUserRunIdeaRound(adminClient, release.ownerUserId, auth.user) : Promise.resolve(false),
      roundOn ? rolloutHasBuiltPlan(adminClient, releaseId) : Promise.resolve(false),
    ]);
    const owner = ownerProfiles.get(release.ownerUserId);
    const round = roundRead && roundRead.ok ? roundRead.value : null;
    const state = round ? effectiveRoundState(round.state, hasPlan) : 'closed';
    const visible = round ? visibleIdeaNotes(allNotes, { state, viewerId: auth.user.id, seeAll: canRun }) : allNotes;
    return NextResponse.json({
      notes: await withAudioUrls(adminClient, visible),
      round: round
        ? {
            state,
            canRun,
            askedCount: new Set(round.askedIds).size,
            inCount: askedInCount(round.askedIds, allNotes),
            ideaCount: allNotes.length,
          }
        : null,
      people: await toIdeasPeoplePayload(adminClient, people, auth.user.id, release),
      ownerName: String(owner?.name || '').trim() || null,
      isOwner: release.ownerUserId === auth.user.id,
      // The mic shows only when speech can be written down.
      voice: Boolean(getTranscriptionConfig()),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load the ideas.' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!ideasEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;
  const release = toIdeasRelease(access.release);

  const body = (await request.json().catch(() => ({}))) as {
    content?: unknown;
    audioPath?: unknown;
    audioSeconds?: unknown;
  };
  const content = String(body.content ?? '').trim();
  if (!content) return NextResponse.json({ error: 'Say or type the idea first.' }, { status: 400 });
  if (content.length > MAX_IDEA_LENGTH) {
    return NextResponse.json({ error: `Keep it under ${MAX_IDEA_LENGTH} characters.` }, { status: 400 });
  }

  // A closed round takes no more ideas from teammates. The owner may still add
  // one to a planned rollout (the suggested-changes flow).
  const roundOn = isIdeaRoundEnabled();
  const [roundRead, canRun, hasPlan] = await Promise.all([
    roundOn ? readIdeaRound(adminClient, releaseId) : Promise.resolve(null),
    roundOn ? canUserRunIdeaRound(adminClient, release.ownerUserId, auth.user) : Promise.resolve(false),
    roundOn ? rolloutHasBuiltPlan(adminClient, releaseId) : Promise.resolve(false),
  ]);
  const round = roundRead && roundRead.ok ? roundRead.value : null;
  if (round && round.state !== 'open' && !canRun && !hasPlan) {
    return NextResponse.json({ error: 'The idea round is closed.' }, { status: 409 });
  }
  const privateRound = Boolean(round && effectiveRoundState(round.state, hasPlan) === 'open');

  const audioPath = isOwnIdeaAudioPath(body.audioPath, releaseId, auth.user.id) ? body.audioPath : null;
  const seconds = Number(body.audioSeconds);
  const audioSeconds = audioPath && Number.isFinite(seconds) ? Math.max(0, Math.min(600, Math.round(seconds))) : null;

  const insert = await adminClient
    .from(IDEAS_TABLE)
    .insert({
      release_id: releaseId,
      user_id: auth.user.id,
      content,
      ...(audioPath ? { audio_path: audioPath, audio_seconds: audioSeconds } : {}),
    })
    .select('id')
    .maybeSingle();
  if (insert.error) {
    return NextResponse.json({ error: insert.error.message || 'Could not save the note.' }, { status: 500 });
  }

  const noteId = String((insert.data as { id?: string } | null)?.id || '');
  if (noteId) {
    afterResponse('rollout idea notification', () =>
      notifyIdeaAdded(adminClient, { release, noteId, authorId: auth.user.id, content, ownerOnly: privateRound })
    );
  }

  try {
    const all = await loadIdeaNotes(adminClient, releaseId, auth.user.id);
    // Everyone asked is in: the round closes by itself, and the owner writes the brief.
    if (round && privateRound && everyoneAskedIsIn(round.askedIds, all)) {
      await closeIdeaRound(adminClient, releaseId, null);
    }
    const visible = privateRound ? visibleIdeaNotes(all, { state: 'open', viewerId: auth.user.id, seeAll: canRun }) : all;
    return NextResponse.json({ notes: await withAudioUrls(adminClient, visible) }, { status: 201 });
  } catch {
    // Saved; the list just could not be read back. The card reloads it.
    return NextResponse.json({ notes: null }, { status: 201 });
  }
}
