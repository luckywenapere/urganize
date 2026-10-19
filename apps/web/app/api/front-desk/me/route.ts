import { NextRequest, NextResponse } from 'next/server';
import { requireDeskPerson } from '../_shared';

// "Is the front desk on for me, and am I a curator?" The pages ask this first.
// 404 for anyone not on the flag list, which the pages read as "old behaviour".
export async function GET(request: NextRequest) {
  const auth = await requireDeskPerson(request);
  if ('error' in auth && auth.error) return auth.error;
  const { data } = await auth.adminClient
    .from('curator_profiles')
    .select('user_id,display_name')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  const row = data as { display_name?: string } | null;
  return NextResponse.json({ enabled: true, isCurator: Boolean(row), curatorName: row?.display_name || null });
}
