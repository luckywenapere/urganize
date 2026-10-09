import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { ensureReleaseTeamWriteAccess } from '@/lib/release-access-server';
import { parseSpendPatch } from '@/lib/release-spend';
import {
  canViewReleaseSpend,
  deleteSpendLine,
  spendToday,
  updateSpendLine,
} from '@/lib/release-spend-server';
import { couldNotCheckSpend, missingReleaseId, noSpendAccess, notConfigured } from '../_shared';

/**
 * Change or delete one spend line.
 *
 * A line Urganize wrote (source 'urganize', today the daily credits line) can be
 * neither changed nor deleted: the server module refuses it with a 403, and its
 * UPDATE and DELETE also carry `source = 'manual'` in the filter, so a race with
 * a sweep cannot reach one either. The line must be one of THIS rollout's: an
 * id from another rollout is a 404, which is also what an id that never existed
 * gets.
 */

type Params = { params: Promise<{ releaseId: string; lineId: string }> };

async function authorize(request: NextRequest, context: Params) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return { response: auth.error } as const;

  const { releaseId, lineId } = await context.params;
  if (!releaseId || !lineId) return { response: missingReleaseId() } as const;

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return { response: notConfigured() } as const;

  const access = await ensureReleaseTeamWriteAccess(admin, releaseId, auth.user);
  if ('error' in access) return { response: access.error } as const;

  const allowed = await canViewReleaseSpend(admin, releaseId, auth.user.id);
  if (allowed === null) return { response: couldNotCheckSpend() } as const;
  if (!allowed) return { response: noSpendAccess() } as const;

  return { admin, releaseId, lineId } as const;
}

export async function PATCH(request: NextRequest, context: Params) {
  const gate = await authorize(request, context);
  if ('response' in gate) return gate.response;

  const body = await request.json().catch(() => null);
  const parsed = parseSpendPatch(body, spendToday());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const updated = await updateSpendLine(gate.admin, {
    releaseId: gate.releaseId,
    lineId: gate.lineId,
    patch: parsed.value,
  });
  if (!updated.ok) return NextResponse.json({ error: updated.error }, { status: updated.status });
  return NextResponse.json({ line: updated.value });
}

export async function DELETE(request: NextRequest, context: Params) {
  const gate = await authorize(request, context);
  if ('response' in gate) return gate.response;

  const deleted = await deleteSpendLine(gate.admin, {
    releaseId: gate.releaseId,
    lineId: gate.lineId,
  });
  if (!deleted.ok) return NextResponse.json({ error: deleted.error }, { status: deleted.status });
  return NextResponse.json({ ok: true, id: deleted.value.id });
}
