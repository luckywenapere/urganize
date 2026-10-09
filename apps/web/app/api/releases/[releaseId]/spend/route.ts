import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';
import { parseSpendCreate } from '@/lib/release-spend';
import {
  canViewReleaseSpend,
  createSpendLine,
  loadSpendPayload,
  spendToday,
} from '@/lib/release-spend-server';
import { couldNotCheckSpend, missingReleaseId, noSpendAccess, notConfigured } from './_shared';

/**
 * A rollout's spend (brief 3, 2026-10-09).
 *
 * GET answers `{ canView, lines, totalKobo, payback }`. A member who may not see
 * spend gets `canView: false` and nothing else, as a 200 rather than an error,
 * which is what lets the rollout menu ask "should I show this row?" without a
 * failure to handle. A person outside the team gets the usual existence-hiding
 * 404.
 *
 * POST adds a manual line. Who may see and change spend is ONE rule in the
 * database (can_view_release_spend: the rollout's owner and its team managers),
 * asked here through lib/release-spend-server.ts, so this route and the row level
 * security policies cannot disagree. If the rule cannot be checked the answer is
 * an error, never a quiet yes.
 *
 * Team-aware like every scene route group: any member may read the section's
 * shape, a guest cannot write, and the spend rule sits on top of both.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamReadAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const payload = await loadSpendPayload(admin, releaseId, auth.user.id);
  if (!payload) return couldNotCheckSpend();
  return NextResponse.json(payload);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return missingReleaseId();

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notConfigured();

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return access.error;

  const allowed = await canViewReleaseSpend(admin, releaseId, auth.user.id);
  if (allowed === null) return couldNotCheckSpend();
  if (!allowed) return noSpendAccess();

  const body = await request.json().catch(() => null);
  const parsed = parseSpendCreate(body, spendToday());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const created = await createSpendLine(admin, {
    releaseId,
    ownerUserId: access.release.ownerUserId,
    actorUserId: auth.user.id,
    draft: parsed.value,
  });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });

  return NextResponse.json({ line: created.value }, { status: 201 });
}
