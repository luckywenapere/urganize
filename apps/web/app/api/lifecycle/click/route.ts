import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/tasks-server';
import { isSafeNextPath } from '@/lib/email-confirmation';
import { afterResponse } from '@/lib/after-response';
import { trackSelfServe } from '@/lib/self-serve-server';

// Self-serve checkout (2026-10-22): the click counter behind every button in a
// nudge or renewal email. Records the first click on the lifecycle_sends row,
// then sends the person on. No session needed (mail apps open links in their
// own browser), and nothing about the person is read from the request. A bad
// id or path still lands somewhere useful: Home.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  const to = request.nextUrl.searchParams.get('to');
  const destination = isSafeNextPath(to) ? to : '/dashboard/artists';
  const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin), 303);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!UUID.test(id) || !supabaseUrl) return response;

  afterResponse('lifecycle-click', async () => {
    const admin = createAdminClient(supabaseUrl);
    if (!admin) return;
    const updated = await admin
      .from('lifecycle_sends')
      .update({ clicked_at: new Date().toISOString() })
      .eq('id', id)
      .is('clicked_at', null)
      .select('kind,key,workspace_id')
      .maybeSingle();
    const row = updated.data as { kind: string; key: string; workspace_id: string } | null;
    if (updated.error || !row) return;
    const team = await admin.from('workspaces').select('owner_id').eq('id', row.workspace_id).maybeSingle();
    const ownerId = (team.data as { owner_id: string } | null)?.owner_id ?? null;
    await trackSelfServe(ownerId, row.kind === 'nudge' ? 'nudge_clicked' : 'renewal_clicked', {
      path: 'self_serve',
      step: row.kind === 'nudge' ? row.key : null,
      source: 'email',
    });
  });
  return response;
}
