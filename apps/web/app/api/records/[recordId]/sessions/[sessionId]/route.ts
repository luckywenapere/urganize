import { NextRequest, NextResponse } from 'next/server';
import { isUuid, parseSessionInput } from '@/lib/next-records';
import { deleteSession, saveSession } from '@/lib/next-records-server';
import { readJson, resolveRecordsContext, respond } from '../../../_shared';

// Replace a whole session (PUT: the body is all of it), or remove it.

type Params = { params: Promise<{ recordId: string; sessionId: string }> };

export async function PUT(request: NextRequest, context: Params) {
  const { recordId, sessionId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  if (!isUuid(sessionId)) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  const parsed = parseSessionInput(await readJson(request));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { adminClient } = resolved.context;
  return respond(await saveSession(adminClient, resolved.context, recordId, sessionId, parsed.value), 'record');
}

export async function DELETE(request: NextRequest, context: Params) {
  const { recordId, sessionId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  if (!isUuid(sessionId)) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  const { adminClient, workspaceId } = resolved.context;
  return respond(await deleteSession(adminClient, workspaceId, recordId, sessionId), 'record');
}
