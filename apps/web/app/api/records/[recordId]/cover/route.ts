import { NextRequest, NextResponse } from 'next/server';
import { parseCoverColor, recordCoverPathPrefix } from '@/lib/next-records';
import { updateRecordCover } from '@/lib/next-records-server';
import { parsePhotoPathInput } from '@/lib/profile-photo';
import { signProfilePhotoUpload } from '@/lib/profile-photo-server';
import { readJson, resolveRecordsContext, respond } from '../../_shared';

// The record's cover (v2, 2026-10-27). POST signs an upload under
// record/<id>/cover/ (the artist photo flow: sign, PUT the bytes, save the
// path). PATCH saves { photoPath } (a string, or null to remove the picture)
// and/or { coverColor } (a palette colour, or null for the artist's).

type Params = { params: Promise<{ recordId: string }> };

export async function POST(request: NextRequest, context: Params) {
  const { recordId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  return signProfilePhotoUpload(resolved.context.adminClient, recordCoverPathPrefix(recordId), await readJson(request), 'record-cover');
}

export async function PATCH(request: NextRequest, context: Params) {
  const { recordId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  const body = (await readJson(request)) as Record<string, unknown>;

  const patch: Partial<{ coverPath: string | null; coverColor: string | null }> = {};
  const photo = parsePhotoPathInput(body, recordCoverPathPrefix(recordId));
  if (photo.kind === 'error') return NextResponse.json({ error: photo.error }, { status: 400 });
  if (photo.kind === 'set') patch.coverPath = photo.path;
  if (photo.kind === 'clear') patch.coverPath = null;
  if (body && typeof body === 'object' && 'coverColor' in body) {
    const colour = parseCoverColor(body.coverColor);
    if ('error' in colour) return NextResponse.json({ error: colour.error }, { status: 400 });
    patch.coverColor = colour.value;
  }

  const { adminClient, workspaceId } = resolved.context;
  return respond(await updateRecordCover(adminClient, workspaceId, recordId, patch), 'record');
}
