import { NextRequest, NextResponse } from 'next/server';
import { defaultPackExpiry, reopenedPackExpiry, type RecipientReceipt } from '@/lib/dj-pack';
import {
  DJ_PACKS_TABLE,
  DJ_PACK_ACCESS_LOG_TABLE,
  DJ_PACK_RECIPIENTS_TABLE,
  asRow,
  createAdminClient,
  ensureSetlistAccess,
  eventsDisabledResponse,
  isEventsFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '@/app/api/events/_shared';

// No `passcode` here any more (founder call, 2026-09-25). The column stays in
// the schema, but nothing ever checked it: the public page served every track
// whether or not one was set, so it promised a lock that did not exist. Each
// person's own link, which the owner can turn off, is the lock.
const PACK_COLUMNS = 'id,event_id,setlist_id,expires_at,created_at';
const RECIPIENT_COLUMNS = 'id,pack_id,recipient_name,recipient_role,token,revoked_at,created_at';

type PackPayload = { id: string; setlistId: string; expiresAt: string | null };

const toPack = (row: Record<string, unknown>, setlistId: string): PackPayload => ({
  id: String(row.id || ''),
  setlistId,
  expiresAt: row.expires_at ? String(row.expires_at) : null,
});

/**
 * Rolls the access log up into one line per recipient.
 *
 * Done here rather than in SQL because the rule is three questions deep
 * (revoked? downloaded? merely opened?) and the copy that renders it lives in
 * lib/dj-pack.ts. A pack has a handful of recipients and tens of log rows.
 */
function buildReceipts(
  recipients: Record<string, unknown>[],
  logRows: Record<string, unknown>[]
): RecipientReceipt[] {
  return recipients.map((row) => {
    const id = String(row.id || '');
    const mine = logRows.filter((entry) => String(entry.recipient_id || '') === id);

    const latest = (action: string): string | null => {
      const times = mine
        .filter((entry) =>
          action === 'download'
            ? String(entry.action || '').startsWith('downloaded')
            : String(entry.action || '') === action
        )
        .map((entry) => String(entry.created_at || ''))
        .filter(Boolean)
        .sort();
      return times.length > 0 ? times[times.length - 1] : null;
    };

    return {
      id,
      name: String(row.recipient_name || ''),
      role: row.recipient_role ? String(row.recipient_role) : null,
      token: String(row.token || ''),
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
      lastViewedAt: latest('viewed'),
      lastDownloadedAt: latest('download'),
      downloadCount: mine.filter((entry) => String(entry.action || '').startsWith('downloaded'))
        .length,
    };
  });
}

/**
 * The set's pack, OLDEST first.
 *
 * A set has one pack. Nothing in the schema enforces that (no unique index on
 * dj_packs.setlist_id), so two creations racing — a double tap, or UrgAns and
 * the page at once — could once mint two, and recipients added to the older
 * one vanished from the screen, which read the newest. Everything here now
 * converges on the OLDEST, and POST removes a duplicate it just made.
 */
async function loadOldestPack(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  setlistId: string
) {
  return adminClient
    .from(DJ_PACKS_TABLE)
    .select(PACK_COLUMNS)
    .eq('setlist_id', setlistId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}

/** The pack for this set, if one has been created, plus who has opened it. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { setlistId } = await context.params;
  if (!setlistId) {
    return NextResponse.json({ error: 'A set id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, false);
  if ('error' in access) return access.error;

  const packResult = await loadOldestPack(adminClient!, setlistId);

  if (packResult.error) {
    return NextResponse.json(
      { error: packResult.error.message || 'Could not load the pack.' },
      { status: 500 }
    );
  }
  if (!packResult.data) {
    return NextResponse.json({ pack: null, receipts: [] });
  }

  const pack = asRow(packResult.data);
  const packId = String(pack.id);

  const [recipientResult, logResult] = await Promise.all([
    adminClient!
      .from(DJ_PACK_RECIPIENTS_TABLE)
      .select(RECIPIENT_COLUMNS)
      .eq('pack_id', packId)
      .order('created_at', { ascending: true }),
    adminClient!
      .from(DJ_PACK_ACCESS_LOG_TABLE)
      .select('recipient_id,action,created_at')
      .eq('pack_id', packId),
  ]);

  if (recipientResult.error) {
    return NextResponse.json(
      { error: recipientResult.error.message || 'Could not load who it went to.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    pack: toPack(pack, setlistId),
    // The log read failing degrades to "nobody has opened it" rather than
    // failing the whole screen: the recipients and their links are the payload,
    // and a missing receipt is visibly a missing receipt.
    receipts: buildReceipts(
      (recipientResult.data || []).map((row) => asRow(row)),
      (logResult.data || []).map((row) => asRow(row))
    ),
  });
}

/**
 * Create the pack for this set.
 *
 * Idempotent: a set has one pack, so calling this twice returns the existing
 * one rather than minting a second set of links for the same songs. Recipients
 * are added separately, because each one needs its own token — that split IS
 * the read-receipt feature.
 *
 * A `passcode` in the body is ignored rather than refused, so an older client
 * or a stale UrgAns transcript still gets its pack.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { setlistId } = await context.params;
  if (!setlistId) {
    return NextResponse.json({ error: 'A set id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  const existing = await loadOldestPack(adminClient!, setlistId);
  if (existing.data) {
    return NextResponse.json({ pack: toPack(asRow(existing.data), setlistId) });
  }

  const setStartAt = access.event.set_start_at ? String(access.event.set_start_at) : null;

  const { data, error } = await adminClient!
    .from(DJ_PACKS_TABLE)
    .insert({
      event_id: access.eventId,
      setlist_id: setlistId,
      owner_user_id: access.ownerUserId,
      expires_at: defaultPackExpiry(setStartAt),
    })
    .select(PACK_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not create the pack.' },
      { status: 500 }
    );
  }

  // Converge. If another request created a pack between our read and our
  // insert, the OLDEST wins and the one we just made (which nobody has been
  // added to yet) is removed, so both callers end up adding people to the same
  // pack.
  const created = asRow(data);
  const oldest = await loadOldestPack(adminClient!, setlistId);
  const winner = oldest.data ? asRow(oldest.data) : created;
  if (String(winner.id) !== String(created.id)) {
    await adminClient!.from(DJ_PACKS_TABLE).delete().eq('id', String(created.id));
    return NextResponse.json({ pack: toPack(winner, setlistId) });
  }

  return NextResponse.json({ pack: toPack(created, setlistId) }, { status: 201 });
}

/**
 * PATCH /api/setlists/[setlistId]/pack — body `{ reopen: true }`.
 *
 * Opens expired links again for three more days (reopenedPackExpiry), for the
 * DJ who lost the files the morning after. Without this, an expired pack was a
 * dead end: every link, including any added afterwards, was dead on arrival.
 * Never shortens a pack.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ setlistId: string }> }
) {
  if (!isEventsFeatureEnabled()) return eventsDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { setlistId } = await context.params;
  if (!setlistId) {
    return NextResponse.json({ error: 'A set id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || body.reopen !== true) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  const existing = await loadOldestPack(adminClient!, setlistId);
  if (!existing.data) {
    return NextResponse.json({ error: 'This set has not been sent yet.' }, { status: 404 });
  }

  const setStartAt = access.event.set_start_at ? String(access.event.set_start_at) : null;
  const packId = String(asRow(existing.data).id);
  const { data, error } = await adminClient!
    .from(DJ_PACKS_TABLE)
    .update({ expires_at: reopenedPackExpiry(setStartAt) })
    .eq('id', packId)
    .select(PACK_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Could not open the links again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ pack: toPack(asRow(data), setlistId) });
}
