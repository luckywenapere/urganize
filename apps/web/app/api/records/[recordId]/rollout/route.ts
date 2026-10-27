import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/next-records';
import { linkRecordRelease } from '@/lib/next-records-rollout-server';
import { readJson, resolveRecordsContext, respond } from '../../_shared';

// Plan the rollout (step 4, 2026-10-27): POST { releaseId } points the record
// at the rollout the browser just made through the ordinary create route. The
// record turns 'planned' only when the plan saves (plan/v2 route).

type Params = { params: Promise<{ recordId: string }> };

export async function POST(request: NextRequest, context: Params) {
  const { recordId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  const body = (await readJson(request)) as { releaseId?: unknown };
  if (!isUuid(body.releaseId)) return NextResponse.json({ error: 'Rollout not found.' }, { status: 404 });
  const { adminClient, workspaceId, userId, artistId } = resolved.context;
  return respond(await linkRecordRelease(adminClient, { workspaceId, userId, artistId }, recordId, body.releaseId), 'record');
}
