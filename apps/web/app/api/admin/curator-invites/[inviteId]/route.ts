import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/app/api/admin/_shared';
import {
  createAdminClient,
  flagOffResponse,
  isPitchingFeatureEnabled,
} from '@/app/api/curator/_shared';

// Revoking an invite is a soft stamp, not a delete: the admin list should keep
// showing that a link was minted and then pulled, and a deleted row would just
// look like it never existed.

const INVITES_TABLE = 'curator_invites';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ inviteId: string }> }
) {
  if (!isPitchingFeatureEnabled()) return flagOffResponse();

  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const { inviteId } = await context.params;
  if (!inviteId) {
    return NextResponse.json({ error: 'Invite id is required.' }, { status: 400 });
  }

  // verifyAdmin is the gate; the queries run on the shared, properly typed
  // service-role client every other route uses. verifyAdmin's own client is
  // built without a schema type, so writes through it resolve to `never`.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const adminClient = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const { data, error: loadError } = await adminClient
    .from(INVITES_TABLE)
    .select('id,used_at,revoked_at')
    .eq('id', inviteId)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json(
      { error: loadError.message || 'Could not load the invite.' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  // verifyAdmin hands back an untyped client, so the row comes through without
  // column types. Narrowed here rather than trusting inference.
  const invite = data as { used_at?: unknown; revoked_at?: unknown };

  // Already used: revoking cannot take the account back, so say so plainly
  // rather than pretending the stamp did something.
  if (invite.used_at) {
    return NextResponse.json(
      { error: 'This link was already used. Revoking it will not remove the account.' },
      { status: 409 }
    );
  }

  // Idempotent: revoking twice is a no-op, not an error.
  if (invite.revoked_at) {
    return NextResponse.json({ success: true });
  }

  const { error } = await adminClient
    .from(INVITES_TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .is('used_at', null);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Could not revoke the invite.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
