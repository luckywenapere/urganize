import { NextRequest, NextResponse } from 'next/server';
import { generateStructuredAiOutput, isAiConfigured, type AiUsage } from '@/lib/ai/provider';
import { countBillingEventsSince, logBillingEvent } from '@/lib/billing-events-server';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import {
  SORT_BATCH_SIZE,
  SORT_DAILY_CAP,
  SORT_SCHEMA,
  SORT_TEXT_MAX,
  buildSortMessages,
  parseSortResponse,
  type SortRequestItem,
} from '@/lib/note-import/ai-sort';
import {
  createAdminClient,
  isNotesFeatureEnabled,
  requireActiveAuthenticatedUser,
} from '../../_shared';

// Bring your notes: the AI pass. The person taps "Sort with UrgAns" and the
// browser sends the cards it is showing, SORT_BATCH_SIZE at a time. Nothing is
// saved here, and the model has no tools: it can only label cards, and every
// label is checked in code (lib/note-import/ai-sort.ts) before it is returned.
export const maxDuration = 60;

const SORT_TIMEOUT_MS = 40_000;

function readItems(payload: unknown): SortRequestItem[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0 || items.length > SORT_BATCH_SIZE) return null;
  const out: SortRequestItem[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id || row.id.length > 24 || seen.has(row.id)) return null;
    if (typeof row.text !== 'string' || !row.text.trim()) return null;
    seen.add(row.id);
    out.push({
      id: row.id,
      text: row.text.slice(0, SORT_TEXT_MAX),
      author: typeof row.author === 'string' ? row.author.slice(0, 60) : null,
      at: typeof row.at === 'string' && !Number.isNaN(Date.parse(row.at)) ? row.at : null,
    });
  }
  return out;
}

export async function POST(request: NextRequest) {
  if (!isNotesFeatureEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  if (!isAiConfigured()) {
    return NextResponse.json({ error: "UrgAns isn't available right now. Your notes are already sorted." }, { status: 503 });
  }

  const items = readItems(await request.json().catch(() => null));
  if (!items) return NextResponse.json({ error: 'Nothing to sort.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (team.primaryWorkspaceId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const used = await countBillingEventsSince(adminClient, team.primaryWorkspaceId, 'notes_import_sort', since);
    if (used >= SORT_DAILY_CAP) {
      return NextResponse.json({ error: "You've used UrgAns a lot today. Try again tomorrow." }, { status: 429 });
    }
  }

  // The rollouts come from the database, never from the request, so a model
  // answer can only ever name one the caller owns.
  const { data: releaseRows, error: releaseError } = await adminClient
    .from('releases')
    .select('id,title')
    .is('deleted_at', null)
    .eq('owner_user_id', auth.user.id)
    .limit(100);
  if (releaseError) {
    return NextResponse.json({ error: 'Could not load your rollouts.' }, { status: 500 });
  }
  const releases = (releaseRows || []).map((row) => ({ id: String(row.id), title: String(row.title || '') }));

  const sentIds = new Set(items.map((item) => item.id));
  const releaseIds = new Set(releases.map((release) => release.id));
  let usage: AiUsage | null = null;

  try {
    const response = await generateStructuredAiOutput({
      messages: buildSortMessages(items, releases, new Date().toISOString().slice(0, 10)),
      model: String(process.env.AI_NOTES_MODEL || '').trim() || undefined,
      jsonSchema: SORT_SCHEMA,
      timeoutMs: SORT_TIMEOUT_MS,
      maxRetries: 2,
      maxOutputTokens: 4000,
      onUsage: (value) => {
        usage = value;
      },
      parse: (raw) => parseSortResponse(raw, sentIds, releaseIds),
      invalidFormatMessage: 'UrgAns answered in a shape we could not read.',
    });

    if (team.primaryWorkspaceId) {
      const seen = usage as AiUsage | null;
      await logBillingEvent(adminClient, {
        workspaceId: team.primaryWorkspaceId,
        ownerUserId: team.ownerUserId,
        actorUserId: auth.user.id,
        type: 'notes_import_sort',
        metadata: { items: items.length, tokensIn: seen?.promptTokens ?? null, tokensOut: seen?.completionTokens ?? null, model: seen?.model ?? null },
      });
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'UrgAns could not sort that just now. Your notes are still sorted by the basics.' }, { status: 502 });
  }
}
