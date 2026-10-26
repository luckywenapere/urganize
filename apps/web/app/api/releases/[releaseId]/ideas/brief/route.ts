import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { isAiConfigured } from '@/lib/ai/provider';
import { generateRoutedStructuredOutput } from '@/lib/ai/routed';
import { legacyModelFor } from '@/lib/ai/model-router';
import { recordRequestUsage } from '@/lib/ai/usage-log-server';
import { usageWorkspaceForOwner } from '@/lib/ai/usage-workspace-server';
import { createUsageCollector } from '@/lib/credits/embedded';
import {
  briefFingerprint,
  buildBriefMessages,
  parseBrief,
  readStoredBrief,
  type RolloutBrief,
} from '@/lib/rollout-brief';
import { loadIdeaNotes } from '@/lib/rollout-ideas-server';
import {
  createAdminClient,
  ensureReleaseTeamReadAccess,
  ideasEnabled,
  notFoundResponse,
  requireActiveAuthenticatedUser,
  toIdeasRelease,
} from '../_shared';

/**
 * The team-facing brief on a rollout (2026-10-26). POST returns the saved brief
 * when the idea notes and the plan's tasks are the same as when it was written,
 * and otherwise has the AI reword them, saves that for everyone on the rollout
 * and returns it. `brief: null` means there is nothing to show (no notes, no AI,
 * or the model failed); the card then keeps the owner's own words.
 *
 * Next up and Missing are not here: they are worked out from the live plan in the
 * browser (lib/rollout-brief.ts). Nothing is charged; the call is logged as
 * `status`, the cheapest rung, like the status update.
 */

export const maxDuration = 60;

const BRIEFS_TABLE = 'release_team_briefs';
const BRIEF_TIMEOUT_MS = 20_000;
const BRIEF_DEADLINE_MS = 52_000;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const startedAt = Date.now();
  if (!ideasEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const access = await ensureReleaseTeamReadAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;
  const release = toIdeasRelease(access.release);

  try {
    const [notes, tasksResult, releaseResult, storedResult] = await Promise.all([
      loadIdeaNotes(adminClient, releaseId, auth.user.id),
      adminClient.from('tasks').select('title').eq('release_id', releaseId),
      adminClient.from('releases').select('release_type').eq('id', releaseId).maybeSingle(),
      adminClient.from(BRIEFS_TABLE).select('content,fingerprint').eq('release_id', releaseId).maybeSingle(),
    ]);
    if (!notes.length) return NextResponse.json({ brief: null });

    const taskTitles = ((tasksResult.data || []) as Array<{ title: string | null }>)
      .map((row) => String(row.title || '').trim())
      .filter(Boolean);
    const fingerprint = briefFingerprint({ notes: notes.map((note) => note.content), taskTitles });

    const stored = storedResult.error
      ? null
      : (storedResult.data as { content?: unknown; fingerprint?: string } | null);
    if (stored?.fingerprint === fingerprint) {
      const saved = readStoredBrief(stored.content);
      if (saved) return NextResponse.json({ brief: saved, fingerprint });
    }

    if (!isAiConfigured()) return NextResponse.json({ brief: null });

    const usage = createUsageCollector(legacyModelFor('status') ?? null);
    const logUsage = async (): Promise<void> => {
      await recordRequestUsage(adminClient, {
        context: {
          requestId: randomUUID(),
          feature: 'status',
          workspaceId: await usageWorkspaceForOwner(release.ownerUserId),
          ownerUserId: release.ownerUserId,
          actorUserId: auth.user.id,
          releaseId,
        },
        calls: usage.calls,
        failures: usage.failures,
        creditsCharged: 0,
      });
    };

    let brief: RolloutBrief;
    try {
      brief = await generateRoutedStructuredOutput<RolloutBrief>({
        surface: 'status',
        messages: buildBriefMessages({
          title: release.title,
          artistName: release.artistName,
          releaseType: String((releaseResult.data as { release_type?: string } | null)?.release_type || 'single'),
          notes: notes.map((note) => ({ author: note.authorName, content: note.content })),
          taskTitles,
        }),
        parse: parseBrief,
        invalidFormatMessage: 'The brief was not usable.',
        timeoutMs: BRIEF_TIMEOUT_MS,
        maxRetries: 1,
        deadlineMs: startedAt + BRIEF_DEADLINE_MS,
        onUsage: usage.onUsage,
        onFailure: usage.onFailure,
      });
    } catch {
      await logUsage();
      return NextResponse.json({ brief: null });
    }
    await logUsage();

    // Saving is best effort: the brief still shows if the write fails.
    await adminClient
      .from(BRIEFS_TABLE)
      .upsert({ release_id: releaseId, content: brief, fingerprint, updated_at: new Date().toISOString() });

    return NextResponse.json({ brief, fingerprint });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load the brief.' },
      { status: 500 }
    );
  }
}
