import { NextRequest, NextResponse } from 'next/server';
import { isUuid, parseSongPatch } from '@/lib/next-records';
import { deleteSong, updateSong } from '@/lib/next-records-server';
import { readJson, resolveRecordsContext, respond } from '../../../_shared';

// Rename a song, move it to another stage, or take it off the record.

type Params = { params: Promise<{ recordId: string; songId: string }> };

export async function PATCH(request: NextRequest, context: Params) {
  const { recordId, songId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  if (!isUuid(songId)) return NextResponse.json({ error: 'Song not found.' }, { status: 404 });
  const parsed = parseSongPatch(await readJson(request));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { adminClient, workspaceId } = resolved.context;
  return respond(await updateSong(adminClient, workspaceId, recordId, songId, parsed.value), 'record');
}

export async function DELETE(request: NextRequest, context: Params) {
  const { recordId, songId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  if (!isUuid(songId)) return NextResponse.json({ error: 'Song not found.' }, { status: 404 });
  const { adminClient, workspaceId } = resolved.context;
  return respond(await deleteSong(adminClient, workspaceId, recordId, songId), 'record');
}
