import { NextRequest, NextResponse } from 'next/server';
import { getNeonClient, verifyAdmin } from '../_shared';
import { resolveAppBaseUrl } from '@/lib/tasks-server';
import {
  ACCESS_INVITES_TABLE,
  approveUser,
  escapeLike,
  generateAccessCode,
  hashAccessCode,
} from '@/lib/access-gate-server';
import {
  accessInviteExpiry,
  buildInviteMessage,
  buildStartPath,
  buildWhatsAppShareUrl,
  normalizeAccessEmail,
  resolveAccessInviteState,
} from '@/lib/access-gate';

// Closed sign-up (2026-10-15): the founder's let-in tools on /admin/waitlist.
// Gated by verifyAdmin (ADMIN_EMAILS), like every /api/admin route.
//
// GET   → { held, invites }: accounts that signed up and are waiting, and the
//         latest invites.
// POST  { action: 'invite', email?, name?, phone?, waitlistId? }
//         Mints one single-use /start/<code> link (14 days). With an email the
//         row also pre-approves that address, so signing up with it lets them
//         in even without the link; an account already held under that email
//         is let in on the spot. Answers the link, a ready message and a
//         WhatsApp share URL. The code is shown here once and stored hashed.
//       { action: 'approve', userId }  lets in an account that is held.
//       { action: 'revoke', id }       closes an unused invite.
// Nothing is emailed: the founder sends the link himself (WhatsApp or copy).

const LIST_LIMIT = 200;

type InviteRow = {
  id: string;
  email: string | null;
  label: string | null;
  waitlist_id: number | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  used_at: string | null;
  used_by: string | null;
};

const INVITE_COLUMNS = 'id,email,label,waitlist_id,created_at,expires_at,revoked_at,used_at,used_by';

function shapeInvite(row: InviteRow) {
  return {
    id: row.id,
    email: row.email,
    label: row.label,
    waitlistId: row.waitlist_id,
    state: resolveAccessInviteState(row),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const client = admin.supabaseAdmin;

  const [heldResult, invitesResult] = await Promise.all([
    client
      .from('profiles')
      .select('id,email,name,role,created_at')
      .is('access_approved_at', null)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT),
    client
      .from(ACCESS_INVITES_TABLE)
      .select(INVITE_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT),
  ]);

  if (heldResult.error || invitesResult.error) {
    return NextResponse.json(
      { error: heldResult.error?.message || invitesResult.error?.message || 'Could not load access.' },
      { status: 500 }
    );
  }

  const held = ((heldResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id || ''),
    email: row.email ? String(row.email) : null,
    name: row.name ? String(row.name) : null,
    role: row.role ? String(row.role) : null,
    createdAt: String(row.created_at || ''),
  }));

  return NextResponse.json(
    { held, invites: ((invitesResult.data || []) as InviteRow[]).map(shapeInvite) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;
  const client = admin.supabaseAdmin;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const action = String(body.action || '');

  if (action === 'approve') {
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) return NextResponse.json({ error: 'Pick an account.' }, { status: 400 });
    const ok = await approveUser(client, userId, 'admin');
    if (!ok) return NextResponse.json({ error: 'Could not let them in.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'revoke') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'Pick an invite.' }, { status: 400 });
    const { error } = await client
      .from(ACCESS_INVITES_TABLE)
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .is('used_at', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action !== 'invite') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const rawEmail = typeof body.email === 'string' ? body.email : '';
  const email = rawEmail.trim() ? normalizeAccessEmail(rawEmail) : '';
  if (rawEmail.trim() && !email) {
    return NextResponse.json({ error: 'That email does not look right.' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : '';
  const waitlistIdNumber = Number(body.waitlistId);
  const waitlistId = Number.isInteger(waitlistIdNumber) && waitlistIdNumber > 0 ? waitlistIdNumber : null;

  // One open invite per email: a second "Let in" replaces the first, so the
  // newest link is the one that works.
  if (email) {
    await client
      .from(ACCESS_INVITES_TABLE)
      .update({ revoked_at: new Date().toISOString() })
      .eq('email', email)
      .is('used_at', null)
      .is('revoked_at', null);
  }

  const code = generateAccessCode();
  const { data, error } = await client
    .from(ACCESS_INVITES_TABLE)
    .insert({
      code_hash: hashAccessCode(code),
      email: email || null,
      label: name || null,
      waitlist_id: waitlistId,
      created_by: admin.userId,
      expires_at: accessInviteExpiry(),
    })
    .select(INVITE_COLUMNS)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Could not create the invite.' }, { status: 500 });
  }
  const row = data as InviteRow;

  // Already signed up and held under this email? Let them in now. The link
  // stays open, so it still works if they want it.
  let approvedExisting = false;
  if (email) {
    const existing = await client
      .from('profiles')
      .select('id,access_approved_at')
      .ilike('email', escapeLike(email))
      .limit(1)
      .maybeSingle();
    const profile = existing.data as { id: string; access_approved_at: string | null } | null;
    if (profile && !profile.access_approved_at) {
      approvedExisting = await approveUser(client, profile.id, 'invite_email');
    }
  }

  // Best-effort: mark the waitlist row converted. The waitlist lives in the
  // marketing site's Neon database; a failure here never fails the invite.
  if (waitlistId) {
    try {
      const sql = getNeonClient();
      if (sql) {
        await sql`UPDATE "User" SET "contactStatus" = 'converted' WHERE id = ${waitlistId}`;
      }
    } catch (neonError) {
      console.warn('[admin/access] waitlist status update failed', neonError);
    }
  }

  const url = `${resolveAppBaseUrl()}${buildStartPath(code)}`;
  const message = buildInviteMessage(url, name);
  return NextResponse.json({
    url,
    message,
    whatsappUrl: buildWhatsAppShareUrl(message, phone),
    approvedExisting,
    invite: shapeInvite(row),
  });
}
