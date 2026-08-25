import { NextRequest, NextResponse } from 'next/server';
import {
  NOTES_LIST_LIMIT,
  NOTES_TABLE,
  NOTE_COLUMNS,
  createAdminClient,
  ensureReleaseOwnership,
  isNotesFeatureEnabled,
  parseNoteBody,
  requireActiveAuthenticatedUser,
  requireActiveAuthenticatedUserOrInternal,
  toNote,
} from './_shared';

/**
 * The owner's whole notebook, pinned first then most recently edited.
 *
 * Deliberately has no `?release=` filter: the client holds the full list in
 * one store and filters in memory, so a server-side param would ship with
 * zero callers. Add it when something real needs it (pagination, a Chappi
 * tool), not before.
 */
export async function GET(request: NextRequest) {
  if (!isNotesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data, error } = await adminClient
    .from(NOTES_TABLE)
    .select(NOTE_COLUMNS)
    .eq('owner_user_id', auth.user.id)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(NOTES_LIST_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not load notes.' }, { status: 500 });
  }

  return NextResponse.json({
    notes: (data || []).map((row) => toNote(row as Record<string, unknown>)),
  });
}

/**
 * Creates a note. Both fields are optional: the editor opens on a real row
 * and autosaves into it, so a note is routinely created empty and typed into
 * a moment later.
 */
export async function POST(request: NextRequest) {
  if (!isNotesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  // *OrInternal: create_note is one of Chappi's tools, and Chappi reaches it by
  // internal fetch so template/notification side effects are never
  // reimplemented (see lib/chappi/tools.ts). Over MCP that fetch carries the
  // caller's MCP credential rather than a Supabase JWT, which the plain helper
  // rejects — so create_note was advertised in tools/list and silently 401'd
  // from its first day until 2026-08-25. Only POST opts in: nothing proxies the
  // GET.
  const auth = await requireActiveAuthenticatedUserOrInternal(request);
  if ('error' in auth) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  let body = '';
  if ('body' in payload && payload.body !== undefined) {
    const parsed = parseNoteBody(payload.body);
    if ('error' in parsed) return parsed.error;
    body = parsed.body;
  }

  let releaseId: string | null = null;
  if ('releaseId' in payload && payload.releaseId !== null && payload.releaseId !== undefined) {
    if (typeof payload.releaseId !== 'string' || !payload.releaseId) {
      return NextResponse.json({ error: 'Release id must be text.' }, { status: 400 });
    }
    releaseId = payload.releaseId;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  if (releaseId) {
    const ownership = await ensureReleaseOwnership(adminClient, releaseId, auth.user.id);
    if ('error' in ownership) return ownership.error;
  }

  const { data, error } = await adminClient
    .from(NOTES_TABLE)
    .insert({ owner_user_id: auth.user.id, release_id: releaseId, body })
    .select(NOTE_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not create the note.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ note: toNote(data as Record<string, unknown>) }, { status: 201 });
}
