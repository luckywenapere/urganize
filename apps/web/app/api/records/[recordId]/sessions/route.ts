import { NextRequest, NextResponse } from 'next/server';
import { parseSessionInput } from '@/lib/next-records';
import { saveSession } from '@/lib/next-records-server';
import { readJson, resolveRecordsContext, respond } from '../../_shared';

// Add a session: a day (or words for one), the people in it and its songs.

type Params = { params: Promise<{ recordId: string }> };

export async function POST(request: NextRequest, context: Params) {
  const { recordId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  const parsed = parseSessionInput(await readJson(request));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { adminClient } = resolved.context;
  return respond(await saveSession(adminClient, resolved.context, recordId, null, parsed.value), 'record', 201);
}
