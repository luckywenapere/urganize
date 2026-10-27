import { NextRequest, NextResponse } from 'next/server';
import { parseRecordPatch } from '@/lib/next-records';
import { readRecord, updateRecord } from '@/lib/next-records-server';
import { readJson, resolveRecordsContext, respond } from '../_shared';

// One record in the making: read it, rename it, change its kind or idea, or
// drop it. Becoming a rollout ('planned') is not a PATCH; it comes with step 4.

type Params = { params: Promise<{ recordId: string }> };

export async function GET(request: NextRequest, context: Params) {
  const { recordId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: false });
  if ('error' in resolved) return resolved.error;
  return respond(await readRecord(resolved.context.adminClient, resolved.context.workspaceId, recordId), 'record');
}

export async function PATCH(request: NextRequest, context: Params) {
  const { recordId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  const parsed = parseRecordPatch(await readJson(request));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { adminClient, workspaceId } = resolved.context;
  return respond(await updateRecord(adminClient, workspaceId, recordId, parsed.value), 'record');
}
