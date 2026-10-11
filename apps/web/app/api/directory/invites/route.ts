import { NextResponse, type NextRequest } from 'next/server';
import { checkDirectoryInviteInput } from '@/lib/directory-invites';
import { createDirectoryInvite, listDirectoryInvites } from '@/lib/directory-invites-server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import {
  asRow,
  createAdminClient,
  directoryDisabledResponse,
  isDirectoryFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../_shared';

// Directory referral invites (2026-10-11, GitHub #834).
//
// GET  -> { ready, invites, sentToday, dailyLimit }  The caller's own invites.
//         { ready: false } before the migration is applied, and on any
//         failure, so the Directory hides the invite row and never breaks.
// POST -> { invite, url, shareText, emailed, emailProblem? }
//         Body { name, role, email?, send }. Makes the private profile and the
//         /welcome link, and emails it only when `send` is true. 429 past
//         DIRECTORY_INVITE_DAILY_LIMIT in 24 hours.
//
// Same gate as the Directory itself: the directory flag first, then any
// signed-in team member through the paywall wrapper (searching the Directory
// is open to every plan; a team with no plan and no trial cannot search, and
// cannot invite either).

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isDirectoryFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ ready: false });

  const list = await listDirectoryInvites(admin, auth.user.id);
  return NextResponse.json(list, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!isDirectoryFeatureEnabled()) return directoryDisabledResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a valid request body.' }, { status: 400 });
  }
  const checked = checkDirectoryInviteInput(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const [profile, team] = await Promise.all([
    admin.from('profiles').select('name').eq('id', auth.user.id).maybeSingle(),
    getTeamAccessForUser(auth.user.id, auth.user.email).catch(() => null),
  ]);
  const inviterName = String(asRow(profile.data).name || '').trim() || null;

  const result = await createDirectoryInvite(admin, {
    inviter: { id: auth.user.id, name: inviterName },
    workspaceId: team?.primaryWorkspaceId ?? null,
    data: checked.data,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, reason: result.reason ?? null }, { status: result.status });
  }
  return NextResponse.json({
    invite: result.invite,
    url: result.url,
    shareText: result.shareText,
    emailed: result.emailed,
    emailProblem: result.emailProblem ?? null,
  });
}
