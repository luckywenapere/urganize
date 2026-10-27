import { NextRequest } from 'next/server';
import { snoozeUntil } from '@/lib/home/record-ask';
import { snoozeRecordAsk } from '@/lib/next-records-server';
import { resolveRecordsContext, respond } from '@/app/api/records/_shared';

// "Nothing yet, ask me in 2 weeks" on Home's "What's next for <artist>?"
// (next record step 3). The snooze lives on the artist, because no record row
// exists yet. See docs/notes/2026-10-27-next-record.md.

type Params = { params: Promise<{ artistId: string }> };

export async function POST(request: NextRequest, context: Params) {
  const { artistId } = await context.params;
  const resolved = await resolveRecordsContext(request, { artistId }, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId } = resolved.context;
  return respond(
    await snoozeRecordAsk(adminClient, workspaceId, resolved.context.artistId, snoozeUntil(new Date())),
    'snooze'
  );
}
