import { NextRequest, NextResponse } from 'next/server';
import { parseSongCreate } from '@/lib/next-records';
import { addSong } from '@/lib/next-records-server';
import { readJson, resolveRecordsContext, respond } from '../../_shared';

// Add a song to a record in the making. It joins at the end of the list.

type Params = { params: Promise<{ recordId: string }> };

export async function POST(request: NextRequest, context: Params) {
  const { recordId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  const parsed = parseSongCreate(await readJson(request));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { adminClient, workspaceId } = resolved.context;
  return respond(await addSong(adminClient, workspaceId, recordId, parsed.value), 'record', 201);
}
