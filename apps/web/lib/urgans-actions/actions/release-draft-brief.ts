import { isAiConfigured } from '@/lib/ai/provider';
import { generateRoutedPlainText } from '@/lib/ai/routed';
import { legacyModelFor, summarizeTrace, type RoutingTrace } from '@/lib/ai/model-router';
import { createUsageCollector, sumTokens } from '@/lib/credits/embedded';
import type { BriefFeel } from '@/lib/brief-board';
import { buildBriefDraftMessages, parseBriefDraft, URGANS_ACTOR_LABEL } from '@/lib/release-brief';
import { BRIEFS_TABLE, fillBriefFeelFromUrgans, loadPlanSeed, saveBriefIdea } from '@/lib/release-brief-server';
import type { UrgansActionDefinition } from '../types';

/**
 * release.draft_brief: UrgAns writes the Idea paragraph of a rollout's brief
 * (URG-281) from what the rollout already holds: its title, artist, format,
 * release day, genre, description and plan.
 *
 * DRAFT, THEN KEEP OR DISCARD, like presskit.draft_section: nothing is written
 * until a person taps Keep. The draft lives in the urgans_actions row between
 * the run and the decision; apply() saves it as the Idea with the revision
 * labelled 'UrgAns', so the brief's history says who wrote it.
 *
 * ONLY ON AN EMPTY IDEA. The empty state is the only place the button shows, and
 * apply() re-reads the idea first: if somebody wrote one while the model was
 * working, theirs is kept and Keep is refused rather than overwriting it.
 *
 * NO DETERMINISTIC FALLBACK, as with every drafting action: there is no
 * template for a song's creative direction. With no model configured, say so.
 *
 * 'team_write': every brief route is team-aware, so any member may draft.
 * Metered by the same embedded-action credits as every other run.
 */

const NOT_CONFIGURED = 'UrgAns cannot write for you yet. Write it yourself for now.';
const DEADLINE_MS = 52_000;
const TIMEOUT_MS = 20_000;

type Input = Record<string, never>;
/** The idea, and since #897 phase 5 the one-line idea and the mood words. */
type Output = { idea: string; feel?: Omit<BriefFeel, 'palette'> };
type Result = { idea: string; updatedAt: string };

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const FORMAT_LABEL: Record<string, string> = { single: 'single', ep: 'EP', album: 'album', music_video: 'music video' };

export const releaseDraftBriefAction: UrgansActionDefinition<Input, Output, Result> = {
  id: 'release.draft_brief',
  label: 'Draft the brief',
  objectTypes: ['release'],
  access: 'team_write',
  promptVersion: 'release-draft-brief-v3',

  async execute({ admin, objectId }) {
    if (!isAiConfigured()) return { ok: false, status: 503, error: NOT_CONFIGURED };

    const [releaseResult, metadataResult, tasksResult, planSeed] = await Promise.all([
      admin
        .from('releases')
        .select('title,artist_name,release_type,release_date,description')
        .eq('id', objectId)
        .maybeSingle(),
      admin.from('release_metadata').select('genre,subgenre').eq('release_id', objectId).maybeSingle(),
      admin
        .from('tasks')
        .select('title,due_date')
        .eq('release_id', objectId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(40),
      loadPlanSeed(admin, objectId),
    ]);
    if (releaseResult.error || !releaseResult.data) {
      return { ok: false, status: 404, error: 'Rollout not found.' };
    }
    const release = asRow(releaseResult.data);
    const metadata = asRow(metadataResult.error ? null : metadataResult.data);
    const genre = [text(metadata.genre), text(metadata.subgenre)].filter(Boolean).join(', ');
    const taskTitles = ((tasksResult.error ? [] : tasksResult.data) || [])
      .map((row) => text(asRow(row).title))
      .filter(Boolean);

    const collector = createUsageCollector(legacyModelFor('status') ?? null);
    let routed: RoutingTrace | null = null;
    let raw: string;
    try {
      // A short paragraph needs no strength: the status surface's cheapest rung.
      raw = await generateRoutedPlainText({
        surface: 'status',
        messages: buildBriefDraftMessages({
          title: text(release.title),
          artistName: text(release.artist_name),
          releaseType: FORMAT_LABEL[text(release.release_type)] ?? '',
          releaseDate: text(release.release_date) || null,
          genre,
          description: text(release.description),
          taskTitles,
          planNotes: planSeed?.idea || undefined,
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
        error: 'UrgAns could not write that just now. Try again.',
        usageCalls: collector.calls,
        failedCalls: collector.failures,
      };
    }

    const draft = parseBriefDraft(raw);
    if (!draft) {
      return {
        ok: false,
        status: 502,
        error: 'UrgAns could not write that just now. Try again.',
        usageCalls: collector.calls,
        failedCalls: collector.failures,
      };
    }

    const trace = routed as RoutingTrace | null;
    return {
      ok: true,
      output: { idea: draft.idea, feel: draft.feel },
      inputSummary: {
        taskCount: taskTitles.length,
        hasGenre: Boolean(genre),
        ...(trace ? { routing: summarizeTrace(trace) } : {}),
      },
      model: trace?.models[trace.models.length - 1] ?? legacyModelFor('status') ?? null,
      tokensIn: sumTokens(collector.calls.map((call) => call.promptTokens)),
      tokensOut: sumTokens(collector.calls.map((call) => call.completionTokens)),
      usageCalls: collector.calls,
      failedCalls: collector.failures,
    };
  },

  async apply({ admin, objectId, actor, output }) {
    const idea = typeof output?.idea === 'string' ? output.idea.trim() : '';
    if (!idea) return { ok: false, status: 400, error: 'There is nothing to keep.' };

    // Somebody may have written an idea while UrgAns was drafting. Theirs wins.
    const current = await admin.from(BRIEFS_TABLE).select('idea').eq('release_id', objectId).maybeSingle();
    if (!current.error && text(asRow(current.data).idea)) {
      return { ok: false, status: 409, error: 'Someone wrote the idea while UrgAns was drafting. Theirs is kept.' };
    }

    const saved = await saveBriefIdea(admin, {
      releaseId: objectId,
      idea,
      actorId: actor.id,
      actorLabel: URGANS_ACTOR_LABEL,
    });
    if (!saved.ok) return { ok: false, status: saved.status, error: saved.error };
    // The one-line idea and the mood words go on the board too, where they are still empty.
    if (output.feel) await fillBriefFeelFromUrgans(admin, { releaseId: objectId, feel: output.feel, actorId: actor.id });
    return { ok: true, result: saved.value };
  },

  async discard() {
    // Nothing was written: the draft only ever lived on the urgans_actions row.
    return { ok: true };
  },
};
