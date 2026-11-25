// Artist verification: the server half (issue #1390). Server only.
//
// NOTHING HERE BLOCKS ANYTHING, AND NOTHING HERE RUNS BY ITSELF. A screenshot
// arrives, an admin decides, the team is told. Every email and push is best
// effort and never throws: the status has already changed by the time we tell
// anyone, and a failed email must never undo or fail that change.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmailConfigured, sendEmail } from './email';
import { sendPushToUsers } from './push-server';
import { signPhotoPath } from './profile-photo-server';
import {
  applyVerificationAction,
  nextStatusAfterSubmit,
  parseProvider,
  parseSender,
  parseVerificationStatus,
  senderFromRole,
  type ArtistVerificationStatus,
  type VerificationAction,
  type VerificationEmailKind,
  type VerificationProvider,
  type VerificationSender,
} from './artist-verification';

const ARTISTS = 'artists';
const VERIFICATIONS = 'artist_verifications';
const EVENTS = 'artist_verification_events';

export type VerificationState = { status: ArtistVerificationStatus; note: string | null };

type ArtistRow = {
  id: string;
  name: string;
  workspace_id: string | null;
  owner_user_id: string | null;
  verification_status: string | null;
  verification_note: string | null;
};

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/**
 * The status of each artist, in its own query so a roster can never fail
 * because of it. An artist whose row cannot be read comes back "not verified".
 */
export async function loadVerificationStates(
  admin: SupabaseClient,
  artistIds: string[]
): Promise<Map<string, VerificationState>> {
  const states = new Map<string, VerificationState>();
  if (artistIds.length === 0) return states;
  try {
    const { data, error } = await admin
      .from(ARTISTS)
      .select('id,verification_status,verification_note')
      .in('id', artistIds);
    if (error || !Array.isArray(data)) return states;
    for (const raw of data) {
      const row = asRow(raw);
      states.set(String(row.id), {
        status: parseVerificationStatus(row.verification_status),
        note: typeof row.verification_note === 'string' && row.verification_note.trim() ? row.verification_note : null,
      });
    }
  } catch {
    // Treated as not verified by the caller.
  }
  return states;
}

async function loadArtist(admin: SupabaseClient, artistId: string): Promise<ArtistRow | null> {
  const { data, error } = await admin
    .from(ARTISTS)
    .select('id,name,workspace_id,owner_user_id,verification_status,verification_note')
    .eq('id', artistId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ArtistRow;
}

/** Whether an artist is taken down. False when it cannot be read, so a failed
 *  read never hides anyone. */
export async function isArtistTakenDown(admin: SupabaseClient, artistId: string): Promise<boolean> {
  try {
    const { data } = await admin.from(ARTISTS).select('verification_status').eq('id', artistId).maybeSingle();
    return parseVerificationStatus(asRow(data).verification_status) === 'taken_down';
  } catch {
    return false;
  }
}

async function recordEvent(
  admin: SupabaseClient,
  event: { artistId: string; action: string; statusAfter: ArtistVerificationStatus; note: string | null; actorId: string | null }
): Promise<void> {
  try {
    await admin.from(EVENTS).insert({
      artist_id: event.artistId,
      action: event.action,
      status_after: event.statusAfter,
      note: event.note,
      actor_user_id: event.actorId,
    });
  } catch {
    // The audit row is best effort; the change itself has already happened.
  }
}

/** The people who hear about an artist: the team's owner and whoever last sent
 *  a screenshot. */
async function recipientsFor(admin: SupabaseClient, artist: ArtistRow): Promise<string[]> {
  const ids = new Set<string>();
  if (artist.workspace_id) {
    const { data: workspace } = await admin.from('workspaces').select('owner_id').eq('id', artist.workspace_id).maybeSingle();
    const owner = asRow(workspace).owner_id;
    if (typeof owner === 'string' && owner) ids.add(owner);
  }
  const { data: latest } = await admin
    .from(VERIFICATIONS)
    .select('submitted_by')
    .eq('artist_id', artist.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const submitter = asRow(latest).submitted_by;
  if (typeof submitter === 'string' && submitter) ids.add(submitter);
  return [...ids];
}

const PUSH_TITLE: Record<VerificationEmailKind, (name: string) => string> = {
  received: (name) => `We got the screenshot for ${name}`,
  approved: (name) => `${name} is verified`,
  needs_fix: (name) => `The screenshot for ${name} did not work`,
  badge_removed: (name) => `${name} is not verified any more`,
  taken_down: (name) => `We have taken down ${name}`,
  brought_back: (name) => `${name} is back on Urganize`,
};

/** Email and push to the team. Never throws. */
export async function notifyTeam(
  admin: SupabaseClient,
  artist: { id: string; name: string; workspace_id: string | null; owner_user_id: string | null },
  kind: VerificationEmailKind,
  note: string | null,
  actorId: string | null
): Promise<void> {
  try {
    const userIds = await recipientsFor(admin, {
      ...artist,
      verification_status: null,
      verification_note: null,
    });
    if (userIds.length === 0) return;

    const url = `/dashboard/${artist.id}`;
    await sendPushToUsers(admin, userIds, {
      title: PUSH_TITLE[kind](artist.name),
      body: note?.trim() || 'Open Urganize to see where it stands.',
      url,
      tag: `artist-verification-${artist.id}`,
    });

    if (!isEmailConfigured()) return;
    for (const userId of userIds) {
      const { data } = await admin.auth.admin.getUserById(userId);
      const email = data?.user?.email;
      if (!email) continue;
      const metadataName = data.user?.user_metadata?.name;
      const result = await sendEmail(admin, {
        templateId: 'artist_verification',
        to: email,
        props: {
          recipientName: typeof metadataName === 'string' ? metadataName : '',
          kind,
          artistName: artist.name,
          artistId: artist.id,
          note,
        },
        trigger: `artist_verification_${kind}`,
        recipientUserId: userId,
        actorUserId: actorId,
      });
      if (!result.ok && !result.skipped) {
        console.error('[artist-verification] email failed', kind, result.error);
      }
    }
  } catch (error) {
    console.error('[artist-verification] notify threw', error instanceof Error ? error.message : error);
  }
}

export type SubmitInput = {
  artistId: string;
  userId: string;
  role: unknown;
  provider: unknown;
  screenshotPath: string;
};

export type SubmitResult = { ok: true; status: ArtistVerificationStatus } | { ok: false; error: string; status?: number };

/** A screenshot arrives. The artist moves to "checking" (or stays taken down
 *  until an admin decides) and the team is told it was received. */
export async function submitVerification(admin: SupabaseClient, input: SubmitInput): Promise<SubmitResult> {
  const provider: VerificationProvider | null = parseProvider(input.provider);
  if (!provider) return { ok: false, error: 'Pick Spotify for Artists or Apple Music for Artists.', status: 400 };

  const artist = await loadArtist(admin, input.artistId);
  if (!artist) return { ok: false, error: 'Artist not found.', status: 404 };

  const current = parseVerificationStatus(artist.verification_status);
  const next = nextStatusAfterSubmit(current);
  if (!next) {
    return {
      ok: false,
      error: current === 'verified' ? 'This artist is already verified.' : 'We are already checking a screenshot for this artist.',
      status: 409,
    };
  }

  const sender: VerificationSender = senderFromRole(input.role);

  // Anything still waiting is replaced by the new one.
  await admin.from(VERIFICATIONS).update({ status: 'superseded' }).eq('artist_id', artist.id).eq('status', 'checking');

  const inserted = await admin.from(VERIFICATIONS).insert({
    artist_id: artist.id,
    workspace_id: artist.workspace_id,
    submitted_by: input.userId,
    sender,
    provider,
    screenshot_path: input.screenshotPath,
    status: 'checking',
  });
  if (inserted.error) {
    console.error('[artist-verification] insert failed', inserted.error.message);
    return { ok: false, error: 'Could not send the screenshot. Try again.', status: 500 };
  }

  // A taken-down artist keeps the reason the team was given until an admin decides.
  if (next !== current) {
    await admin.from(ARTISTS).update({ verification_status: next, verification_note: null }).eq('id', artist.id);
  }
  await recordEvent(admin, { artistId: artist.id, action: 'submitted', statusAfter: next, note: null, actorId: input.userId });
  await notifyTeam(admin, artist, 'received', null, input.userId);
  return { ok: true, status: next };
}

export type AdminActionInput = {
  artistId: string;
  action: VerificationAction;
  note: string | null;
  adminId: string;
};

export type AdminActionResult = { ok: true; status: ArtistVerificationStatus } | { ok: false; error: string; status?: number };

/** An admin decides. Only an admin can reach this, and only take down hides an
 *  artist. The team gets an email and a push for every action. */
export async function runAdminAction(admin: SupabaseClient, input: AdminActionInput): Promise<AdminActionResult> {
  const artist = await loadArtist(admin, input.artistId);
  if (!artist) return { ok: false, error: 'Artist not found.', status: 404 };

  const current = parseVerificationStatus(artist.verification_status);
  const result = applyVerificationAction(current, input.action, input.note);
  if (!result.ok) return { ok: false, error: result.error, status: 409 };

  const note = input.note?.trim() ? input.note.trim() : null;
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { verification_status: result.status };

  switch (input.action) {
    case 'approve':
      update.verified_at = now;
      update.taken_down_at = null;
      update.verification_note = null;
      break;
    case 'ask_again':
      update.verification_note = note;
      break;
    case 'remove_badge':
      update.verified_at = null;
      update.verification_note = note;
      break;
    case 'take_down':
      update.taken_down_at = now;
      update.verification_note = note;
      break;
    case 'bring_back':
      update.taken_down_at = null;
      update.verification_note = null;
      break;
  }

  const saved = await admin.from(ARTISTS).update(update).eq('id', artist.id);
  if (saved.error) {
    console.error('[artist-verification] action failed', saved.error.message);
    return { ok: false, error: 'Could not save that. Try again.', status: 500 };
  }

  if (input.action === 'approve' || input.action === 'ask_again') {
    await admin
      .from(VERIFICATIONS)
      .update({
        status: input.action === 'approve' ? 'approved' : 'needs_fix',
        admin_note: note,
        reviewed_by: input.adminId,
        reviewed_at: now,
      })
      .eq('artist_id', artist.id)
      .eq('status', 'checking');
  }

  await recordEvent(admin, { artistId: artist.id, action: input.action, statusAfter: result.status, note, actorId: input.adminId });
  await notifyTeam(admin, artist, result.email, note, input.adminId);
  return { ok: true, status: result.status };
}

export type QueueItem = {
  artistId: string;
  artistName: string;
  teamName: string;
  status: ArtistVerificationStatus;
  note: string | null;
  verificationId: string | null;
  provider: VerificationProvider | null;
  sender: VerificationSender | null;
  sentAt: string | null;
  screenshotUrl: string | null;
  linked: { spotify: string | null; apple: string | null; deezer: string | null };
};

/** Every artist that is waiting, needs a fix, is verified or is taken down,
 *  newest first, with the latest screenshot signed so the admin can open it. */
export async function loadVerificationQueue(admin: SupabaseClient): Promise<QueueItem[]> {
  const { data: artists } = await admin
    .from(ARTISTS)
    .select('id,name,workspace_id,verification_status,verification_note,spotify_artist_id,apple_artist_id,deezer_artist_id')
    .neq('verification_status', 'unverified')
    .order('updated_at', { ascending: false })
    .limit(300);
  const rows = Array.isArray(artists) ? artists.map(asRow) : [];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => String(row.id));
  const workspaceIds = [...new Set(rows.map((row) => row.workspace_id).filter((v): v is string => typeof v === 'string'))];

  const [{ data: submissions }, { data: workspaces }] = await Promise.all([
    admin
      .from(VERIFICATIONS)
      .select('id,artist_id,provider,sender,screenshot_path,created_at,status')
      .in('artist_id', ids)
      .order('created_at', { ascending: false }),
    workspaceIds.length
      ? admin.from('workspaces').select('id,name').in('id', workspaceIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const latest = new Map<string, Record<string, unknown>>();
  for (const raw of Array.isArray(submissions) ? submissions : []) {
    const row = asRow(raw);
    const key = String(row.artist_id);
    if (!latest.has(key)) latest.set(key, row);
  }
  const teamNames = new Map<string, string>();
  for (const raw of Array.isArray(workspaces) ? workspaces : []) {
    const row = asRow(raw);
    teamNames.set(String(row.id), typeof row.name === 'string' ? row.name : '');
  }

  return Promise.all(
    rows.map(async (row): Promise<QueueItem> => {
      const submission = latest.get(String(row.id));
      const path = submission ? submission.screenshot_path : null;
      return {
        artistId: String(row.id),
        artistName: typeof row.name === 'string' ? row.name : '',
        teamName: teamNames.get(String(row.workspace_id)) ?? '',
        status: parseVerificationStatus(row.verification_status),
        note: typeof row.verification_note === 'string' && row.verification_note ? row.verification_note : null,
        verificationId: submission ? String(submission.id) : null,
        provider: submission ? parseProvider(submission.provider) : null,
        sender: submission ? parseSender(submission.sender) : null,
        sentAt: submission && typeof submission.created_at === 'string' ? submission.created_at : null,
        screenshotUrl: await signPhotoPath(admin, path),
        linked: {
          spotify: typeof row.spotify_artist_id === 'string' ? row.spotify_artist_id : null,
          apple: typeof row.apple_artist_id === 'string' ? row.apple_artist_id : null,
          deezer: typeof row.deezer_artist_id === 'string' ? row.deezer_artist_id : null,
        },
      };
    })
  );
}
