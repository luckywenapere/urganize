import { NextRequest, NextResponse } from 'next/server';
import { parseRecordCreate } from '@/lib/next-records';
import { createRecord, listArtistRecords } from '@/lib/next-records-server';
import { readJson, resolveRecordsContext, respond } from '@/app/api/records/_shared';

// An artist's records still being made (the artist page's "In the making"),
// and starting a new one. See docs/notes/2026-10-27-next-record.md.

type Params = { params: Promise<{ artistId: string }> };

export async function GET(request: NextRequest, context: Params) {
  const { artistId } = await context.params;
  const resolved = await resolveRecordsContext(request, { artistId }, { write: false });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;
  return respond(await listArtistRecords(adminClient, workspaceId, resolved.context.artistId), 'records');
}

export async function POST(request: NextRequest, context: Params) {
  const { artistId } = await context.params;
  const resolved = await resolveRecordsContext(request, { artistId }, { write: true });
  if ('error' in resolved) return resolved.error;
  const parsed = parseRecordCreate(await readJson(request));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { adminClient, workspaceId, userId } = resolved.context;
  return respond(
    await createRecord(adminClient, { workspaceId, artistId: resolved.context.artistId, userId, ...parsed.value }),
    'record',
    201
  );
}
