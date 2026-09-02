import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { parseRecipient } from '@/lib/dj-pack';
import {
  asRow,
  createAdminClient,
  ensureSetlistAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '@/app/api/events/_shared';

const PACKS_TABLE = 'dj_packs';
const RECIPIENTS_TABLE = 'dj_pack_recipients';

/** 18 random bytes, base64url — the release_epks / capture-page shape. This is
 *  the ONLY access control on the public page, so it has to be unguessable, and
 *  it stays readable (never hashed) because the owner copies it into WhatsApp. */
const generateToken = (): string => randomBytes(18).toString('base64url');

/**
 * Add someone to a pack. Each recipient gets their OWN link.
 *
 * That is not a nicety — it is the entire mechanism behind read receipts. One
 * shared URL can tell you somebody opened the pack; it can never tell you
 * WHICH somebody, which is the only version of the question worth answering
 * ("the DJ has them, the engineer does not").
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ packId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { packId } = await context.params;
  if (!packId) {
    return NextResponse.json({ error: 'A pack id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseRecipient(body || {});
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  // Access is resolved through the pack's SETLIST, so this route carries no
  // rule of its own — the same decision that guards the set guards who can be
  // handed it.
  const pack = await adminClient
    .from(PACKS_TABLE)
    .select('id,setlist_id')
    .eq('id', packId)
    .maybeSingle();

  if (pack.error) {
    return NextResponse.json(
      { error: pack.error.message || 'Could not load the pack.' },
      { status: 500 }
    );
  }
  if (!pack.data) {
    return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  }

  const setlistId = String(asRow(pack.data).setlist_id || '');
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  const { data, error } = await adminClient
    .from(RECIPIENTS_TABLE)
    .insert({
      pack_id: packId,
      owner_user_id: access.ownerUserId,
      recipient_name: parsed.name,
      recipient_role: parsed.role,
      token: generateToken(),
    })
    .select('id,recipient_name,recipient_role,token,revoked_at')
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not add them to the pack.' },
      { status: 500 }
    );
  }

  const row = asRow(data);
  return NextResponse.json(
    {
      recipient: {
        id: String(row.id),
        name: String(row.recipient_name || ''),
        role: row.recipient_role ? String(row.recipient_role) : null,
        token: String(row.token || ''),
        revokedAt: null,
        lastViewedAt: null,
        lastDownloadedAt: null,
        downloadCount: 0,
      },
    },
    { status: 201 }
  );
}
