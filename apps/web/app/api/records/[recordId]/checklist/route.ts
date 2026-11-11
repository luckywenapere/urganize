import { NextRequest } from 'next/server';
import { seedSongChecklist } from '@/lib/next-records-server';
import { resolveRecordsContext, respond } from '../../_shared';

// The song checklist (2026-11-11, #1143). New projects get it when they are
// made; this adds it to a project made before, from the button on its page.
// Adds only what is missing, so a second tap adds nothing.

type Params = { params: Promise<{ recordId: string }> };

export async function POST(request: NextRequest, context: Params) {
  const { recordId } = await context.params;
  const resolved = await resolveRecordsContext(request, { recordId }, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId, userId } = resolved.context;
  return respond(await seedSongChecklist(adminClient, { workspaceId, recordId, userId }), 'checklist');
}
