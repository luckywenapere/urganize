import { NextRequest, NextResponse } from 'next/server';
import { defaultPackExpiry, type RecipientReceipt } from '@/lib/dj-pack';
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
const ACCESS_LOG_TABLE = 'dj_pack_access_log';

const PACK_COLUMNS = 'id,event_id,setlist_id,passcode,expires_at,created_at';
const RECIPIENT_COLUMNS = 'id,pack_id,recipient_name,recipient_role,token,revoked_at,created_at';

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

  const packResult = await adminClient!
    .from(PACKS_TABLE)
    .select(PACK_COLUMNS)
    .eq('setlist_id', setlistId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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
      .from(RECIPIENTS_TABLE)
      .select(RECIPIENT_COLUMNS)
      .eq('pack_id', packId)
      .order('created_at', { ascending: true }),
    adminClient!
      .from(ACCESS_LOG_TABLE)
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
    pack: {
      id: packId,
      setlistId,
      passcode: pack.passcode ? String(pack.passcode) : null,
      expiresAt: pack.expires_at ? String(pack.expires_at) : null,
    },
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

  const body = await request.json().catch(() => null);
  const passcode = typeof body?.passcode === 'string' ? body.passcode.trim() : '';
  // Opt in (founder call), so the normal state is no lock at all.
  if (passcode && !/^[0-9]{4}$/.test(passcode)) {
    return NextResponse.json({ error: 'A passcode is four digits.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  const access = await ensureSetlistAccess(adminClient, setlistId, auth.user, true);
  if ('error' in access) return access.error;

  const existing = await adminClient!
    .from(PACKS_TABLE)
    .select(PACK_COLUMNS)
    .eq('setlist_id', setlistId)
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    const pack = asRow(existing.data);
    return NextResponse.json({
      pack: {
        id: String(pack.id),
        setlistId,
        passcode: pack.passcode ? String(pack.passcode) : null,
        expiresAt: pack.expires_at ? String(pack.expires_at) : null,
      },
    });
  }

  const setStartAt = access.event.set_start_at ? String(access.event.set_start_at) : null;

  const { data, error } = await adminClient!
    .from(PACKS_TABLE)
    .insert({
      event_id: access.eventId,
      setlist_id: setlistId,
      owner_user_id: access.ownerUserId,
      passcode: passcode || null,
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

  const pack = asRow(data);
  return NextResponse.json(
    {
      pack: {
        id: String(pack.id),
        setlistId,
        passcode: pack.passcode ? String(pack.passcode) : null,
        expiresAt: pack.expires_at ? String(pack.expires_at) : null,
      },
    },
    { status: 201 }
  );
}
