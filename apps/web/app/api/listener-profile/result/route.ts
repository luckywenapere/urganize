import { NextRequest, NextResponse } from 'next/server';
import { parseListenerPersonaResult } from '@/lib/listener-profile';
import {
  createAdminClient,
  getAuthenticatedUser,
  isOptionalTableMissingError,
  LISTENER_PROFILE_TABLE,
  LISTENER_PROFILE_TABLE_SQL,
} from '../_shared';

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data, error } = await adminClient
    .from(LISTENER_PROFILE_TABLE)
    .select('generated_persona,generated_at,updated_at')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    if (isOptionalTableMissingError(error)) {
      return NextResponse.json({ error: 'Listener profile table is missing', sql: LISTENER_PROFILE_TABLE_SQL }, { status: 501 });
    }
    return NextResponse.json({ error: error.message || 'Could not load listener profile result' }, { status: 500 });
  }

  const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const persona = parseListenerPersonaResult(row?.generated_persona);

  return NextResponse.json({
    exists: Boolean(persona),
    persona,
    generatedAt: String(row?.generated_at || '').trim() || null,
    updatedAt: String(row?.updated_at || '').trim() || null,
  });
}
