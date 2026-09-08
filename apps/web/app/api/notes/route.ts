import { NextRequest, NextResponse } from 'next/server';
import {
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
import {
  NOTES_PAGE_SIZE,
  decodeNoteCursor,
  encodeNoteCursor,
  takeNotePage,
} from '@/lib/note-paging';

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

  // Keyset paging. See lib/note-paging.ts for why keyset and not offset, and
  // why pinned notes are returned whole rather than paged.
  const cursor = decodeNoteCursor(request.nextUrl.searchParams.get('cursor'));

  // Pinned notes ride along on the FIRST page only — they are the top of the
  // list by definition, so re-sending them with every page would duplicate
  // them in the client's store. Capped like anything else, but not paged:
  // pinning exists to keep a handful of notes above the rest.
  let pinned: Record<string, unknown>[] = [];
  if (!cursor) {
    const { data, error } = await adminClient
      .from(NOTES_TABLE)
      .select(NOTE_COLUMNS)
      .eq('owner_user_id', auth.user.id)
      .eq('pinned', true)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(NOTES_PAGE_SIZE);
    if (error) {
      return NextResponse.json(
        { error: error.message || 'Could not load notes.' },
        { status: 500 }
      );
    }
    pinned = (data || []) as Record<string, unknown>[];
  }

  // One more than the page so `hasMore` needs no second COUNT query.
  let query = adminClient
    .from(NOTES_TABLE)
    .select(NOTE_COLUMNS)
    .eq('owner_user_id', auth.user.id)
    .eq('pinned', false);

  if (cursor) {
    // Strictly after the cursor in (updated_at desc, id desc). Both halves are
    // shape-validated by decodeNoteCursor, so neither can carry a PostgREST
    // filter delimiter.
    query = query.or(
      `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`
    );
  }

  const { data: rest, error } = await query
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(NOTES_PAGE_SIZE + 1);

  if (error) {
    return NextResponse.json({ error: error.message || 'Could not load notes.' }, { status: 500 });
  }

  const { page, hasMore } = takeNotePage((rest || []) as Record<string, unknown>[], NOTES_PAGE_SIZE);
  const last = page[page.length - 1];

  return NextResponse.json({
    notes: [...pinned, ...page].map((row) => toNote(row)),
    hasMore,
    // Only ever built from a row we actually handed out, so the next page
    // starts exactly where this one stopped.
    nextCursor:
      hasMore && last
        ? encodeNoteCursor({ updatedAt: String(last.updated_at), id: String(last.id) })
        : null,
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
