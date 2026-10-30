import type { User } from '@supabase/supabase-js';
import { isAiConfigured } from '@/lib/ai/provider';
import { generateRoutedPlainText } from '@/lib/ai/routed';
import { legacyModelFor, summarizeTrace, type RoutingTrace } from '@/lib/ai/model-router';
import { createUsageCollector, sumTokens } from '@/lib/credits/embedded';
import { buildBriefFromIdeasMessages, parseBriefFromIdeas, type BriefFromIdeas } from '@/lib/idea-round';
import { canUserRunIdeaRound, readIdeaRound } from '@/lib/idea-round-server';
import { URGANS_ACTOR_LABEL } from '@/lib/release-brief';
import { BRIEF_DECISIONS_TABLE, BRIEFS_TABLE, fillBriefFeelFromUrgans, recordBriefRevision } from '@/lib/release-brief-server';
import { loadIdeaNotes } from '@/lib/rollout-ideas-server';
import type { UrgansActionDefinition } from '../types';

/**
 * release.brief_from_ideas (2026-10-27): once a rollout's idea round is
 * closed, UrgAns merges everyone's ideas into the brief: the Idea paragraph,
 * one-line decisions (each credited to whose idea it came from), and every
 * place two people want different things as a question to settle. It never
 * picks a side.
 *
 * ONE SHOT, like release.draft_plan: the run writes the brief straight away,
 * because the brief page IS the review. Nothing downstream happens until the
 * manager approves it there. An idea someone already wrote on the brief is
 * kept; UrgAns's paragraph only fills an empty one.
 *
 * Only the rollout owner or a team owner/admin, and only on a closed round.
 * Metered by the same embedded-action credits as every other run.
 */

const NOT_CONFIGURED = 'UrgAns cannot write the brief yet. Write it yourself for now.';
const DEADLINE_MS = 52_000;
const TIMEOUT_MS = 25_000;

type Input = Record<string, never>;
type Output = BriefFromIdeas & { keptIdea: boolean };

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const FORMAT_LABEL: Record<string, string> = { single: 'single', ep: 'EP', album: 'album', music_video: 'music video' };

export const releaseBriefFromIdeasAction: UrgansActionDefinition<Input, Output, Output> = {
  id: 'release.brief_from_ideas',
  label: 'Write the brief from the ideas',
  objectTypes: ['release'],
  access: 'team_write',
  promptVersion: 'release-brief-from-ideas-v2',
  oneShot: true,

  async execute({ admin, objectId, actor, ownerUserId }) {
    if (!isAiConfigured()) return { ok: false, status: 503, error: NOT_CONFIGURED };

    // The access check only knows the actor's id; that is all the role lookup reads.
    if (!(await canUserRunIdeaRound(admin, ownerUserId, { id: actor.id, email: actor.email ?? undefined } as User))) {
      return { ok: false, status: 403, error: 'Only the owner can write the brief.' };
    }
    const round = await readIdeaRound(admin, objectId);
    if (!round.ok) return { ok: false, status: round.status, error: round.error };
    if (round.value.state === 'open') return { ok: false, status: 409, error: 'Close the idea round first.' };
    if (round.value.state === 'approved') {
      return { ok: false, status: 409, error: 'This brief is approved. Make a new version to change it.' };
    }

    const [releaseResult, notes] = await Promise.all([
      admin.from('releases').select('title,artist_name,release_type').eq('id', objectId).maybeSingle(),
      loadIdeaNotes(admin, objectId, actor.id).catch(() => []),
    ]);
    if (releaseResult.error || !releaseResult.data) return { ok: false, status: 404, error: 'Rollout not found.' };
    if (!notes.length) return { ok: false, status: 400, error: 'There are no ideas to write from yet.' };
    const release = asRow(releaseResult.data);
    const ideas = notes.map((note) => ({ author: note.authorName, content: note.content }));

    const collector = createUsageCollector(legacyModelFor('status') ?? null);
    let routed: RoutingTrace | null = null;
    let raw: string;
    try {
      raw = await generateRoutedPlainText({
        surface: 'status',
        messages: buildBriefFromIdeasMessages({
          title: text(release.title),
          artistName: text(release.artist_name),
          releaseType: FORMAT_LABEL[text(release.release_type)] ?? '',
          ideas,
        }),
        timeoutMs: TIMEOUT_MS,
        maxRetries: 2,
        deadlineMs: Date.now() + DEADLINE_MS,
        onUsage: collector.onUsage,
        onFailure: collector.onFailure,
        onTrace: (trace) => {
          routed = trace;
        },
      });
    } catch {
      return {
        ok: false,
        status: 502,
        error: 'UrgAns could not write the brief just now. Try again.',
        usageCalls: collector.calls,
        failedCalls: collector.failures,
      };
    }

    const brief = parseBriefFromIdeas(raw, [...new Set(notes.map((note) => note.authorName))]);
    if (!brief) {
      return {
        ok: false,
        status: 502,
        error: 'UrgAns could not write the brief just now. Try again.',
        usageCalls: collector.calls,
        failedCalls: collector.failures,
      };
    }

    // Write it. An idea a person already wrote is kept.
    const keptIdea = Boolean(round.value.idea.trim());
    const now = new Date().toISOString();
    const { error: briefError } = await admin.from(BRIEFS_TABLE).upsert(
      {
        release_id: objectId,
        ...(keptIdea ? {} : { idea: brief.idea, updated_by: actor.id, updated_at: now }),
        to_settle: brief.toSettle,
      },
      { onConflict: 'release_id' }
    );
    if (briefError) {
      return {
        ok: false,
        status: 500,
        error: 'Could not save the brief.',
        usageCalls: collector.calls,
        failedCalls: collector.failures,
      };
    }
    if (brief.decisions.length) {
      await admin.from(BRIEF_DECISIONS_TABLE).insert(
        brief.decisions.map((decision) => ({
          release_id: objectId,
          body: decision.body,
          created_by: actor.id,
          source: decision.source,
        }))
      );
    }
    if (!keptIdea) {
      await recordBriefRevision(admin, { releaseId: objectId, block: 'idea', actorId: actor.id, actorLabel: URGANS_ACTOR_LABEL });
    }
    // The first board (#897 phase 5): the one-line idea and the mood words, where still empty.
    await fillBriefFeelFromUrgans(admin, { releaseId: objectId, feel: brief.feel, actorId: actor.id });

    const trace = routed as RoutingTrace | null;
    return {
      ok: true,
      output: { ...brief, keptIdea },
      inputSummary: {
        ideaCount: notes.length,
        decisionCount: brief.decisions.length,
        toSettleCount: brief.toSettle.length,
        ...(trace ? { routing: summarizeTrace(trace) } : {}),
      },
      model: trace?.models[trace.models.length - 1] ?? legacyModelFor('status') ?? null,
      tokensIn: sumTokens(collector.calls.map((call) => call.promptTokens)),
      tokensOut: sumTokens(collector.calls.map((call) => call.completionTokens)),
      usageCalls: collector.calls,
      failedCalls: collector.failures,
    };
  },
};
