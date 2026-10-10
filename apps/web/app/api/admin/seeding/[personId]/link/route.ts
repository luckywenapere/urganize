import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/app/api/admin/_shared';
import { createAdminClient } from '@/app/api/_shared/auth';
import { buildSeedMessages, claimUrl } from '@/lib/seeding';
import { mintClaimLink } from '@/lib/seeding-server';

// "New link" for somebody already on the list. Ends any unused link first, so
// two live links never exist for one person. Admin only.

const SEEDED = 'seeded_profiles';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ personId: string }> }
) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const { personId } = await context.params;
  if (!personId) return NextResponse.json({ error: 'Person id is required.' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const client = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!client) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  // Only people who are on the seeding list, and only until they have claimed
  // the profile: after that the profile is theirs and no link can reach it.
  const seeded = await client.from(SEEDED).select('person_id, contact_name').eq('person_id', personId).maybeSingle();
  if (seeded.error) return NextResponse.json({ error: 'Could not load this person.' }, { status: 500 });
  if (!seeded.data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const profile = await client.from('person_profiles').select('status').eq('id', personId).maybeSingle();
  if (profile.error) return NextResponse.json({ error: 'Could not load this person.' }, { status: 500 });
  if (!profile.data || (profile.data as { status?: string }).status !== 'unclaimed') {
    return NextResponse.json({ error: 'They have already claimed this profile.' }, { status: 409 });
  }

  const link = await mintClaimLink(client, { personId, actorUserId: admin.userId });
  if (!link.ok) return NextResponse.json({ error: link.error }, { status: 500 });

  const name = String((seeded.data as { contact_name?: string }).contact_name || '');
  const url = claimUrl(new URL(request.url).origin, link.token);
  return NextResponse.json({ url, messages: buildSeedMessages({ name, url }) });
}
