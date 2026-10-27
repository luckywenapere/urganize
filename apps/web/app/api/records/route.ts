import { NextRequest, NextResponse } from 'next/server';
import { readReleaseRecord } from '@/lib/next-records-rollout-server';
import { resolveRecordsContext, respond } from './_shared';

// "Made from your record" on a rollout (step 4, 2026-10-27): GET
// ?releaseId=<id> answers the record that became this rollout, or 404 when
// none did (the card then shows nothing).

export async function GET(request: NextRequest) {
  const releaseId = request.nextUrl.searchParams.get('releaseId') ?? '';
  if (!releaseId) return NextResponse.json({ error: 'releaseId is required.' }, { status: 400 });
  const resolved = await resolveRecordsContext(request, { releaseId }, { write: false });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;
  return respond(await readReleaseRecord(adminClient, workspaceId, releaseId), 'record');
}
