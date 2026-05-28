import { NextRequest, NextResponse } from 'next/server';
import {
  UI_DRAFTS_TABLE,
  UI_DRAFTS_TABLE_SQL,
  createAdminClient,
  requireActiveAuthenticatedUser,
  isOptionalTableMissingError,
} from './_shared';

const normalizeScope = (value: string | null): string => String(value || '').trim().toLowerCase();
const normalizeDraftKey = (value: string | null): string => String(value || '').trim();

export async function GET(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const scope = normalizeScope(request.nextUrl.searchParams.get('scope'));
  const draftKey = normalizeDraftKey(request.nextUrl.searchParams.get('draftKey'));
  if (!scope || !draftKey) {
    return NextResponse.json({ error: 'scope and draftKey are required' }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from(UI_DRAFTS_TABLE)
    .select('draft_key,scope,payload_json,updated_at')
    .eq('user_id', auth.user.id)
    .eq('scope', scope)
    .eq('draft_key', draftKey)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Draft table is not configured yet.', sql: UI_DRAFTS_TABLE_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not load draft.' }, { status: 500 });
  }

  return NextResponse.json({
    draft: data
      ? {
          draftKey: data.draft_key,
          scope: data.scope,
          payload: data.payload_json || {},
          updatedAt: data.updated_at || null,
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    scope?: string;
    draftKey?: string;
    payload?: unknown;
  };

  const scope = normalizeScope(body.scope || null);
  const draftKey = normalizeDraftKey(body.draftKey || null);
  if (!scope || !draftKey) {
    return NextResponse.json({ error: 'scope and draftKey are required' }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from(UI_DRAFTS_TABLE)
    .upsert(
      {
        user_id: auth.user.id,
        scope,
        draft_key: draftKey,
        payload_json: body.payload && typeof body.payload === 'object' ? body.payload : {},
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,draft_key',
      }
    )
    .select('draft_key,scope,payload_json,updated_at')
    .single();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Draft table is not configured yet.', sql: UI_DRAFTS_TABLE_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not save draft.' }, { status: 500 });
  }

  return NextResponse.json({
    draft: {
      draftKey: data.draft_key,
      scope: data.scope,
      payload: data.payload_json || {},
      updatedAt: data.updated_at || null,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const scope = normalizeScope(request.nextUrl.searchParams.get('scope'));
  const draftKey = normalizeDraftKey(request.nextUrl.searchParams.get('draftKey'));
  if (!scope || !draftKey) {
    return NextResponse.json({ error: 'scope and draftKey are required' }, { status: 400 });
  }

  const { error } = await adminClient
    .from(UI_DRAFTS_TABLE)
    .delete()
    .eq('user_id', auth.user.id)
    .eq('scope', scope)
    .eq('draft_key', draftKey);

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Draft table is not configured yet.', sql: UI_DRAFTS_TABLE_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not clear draft.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
