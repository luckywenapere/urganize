import { isAiConfigured } from '@/lib/ai/provider';
import { generateRoutedStructuredOutput } from '@/lib/ai/routed';
import { legacyModelFor, summarizeTrace, type RoutingTrace } from '@/lib/ai/model-router';
import { createUsageCollector, sumTokens } from '@/lib/credits/embedded';
import {
  EMPTY_PITCH_CONTEXT,
  buildPitchMessages,
  emptyPitchFieldKeys,
  parsePitchDraftResponse,
  type PitchContext,
} from '@/lib/editorial-pitch-draft';
import {
  PITCH_FIELD_KEYS,
  isEditorialPitchTask,
  mergeDraftIntoEmpty,
  type PitchFieldKey,
  type PitchFields,
} from '@/lib/editorial-pitch';
import { readPitchTaskMeta, readTemplateOrigin, savePitchFields } from '@/lib/editorial-pitch-server';
import { loadPitchKit } from '@/lib/release-epk-server';
import type { UrgansActionDefinition } from '../types';

/**
 * release.draft_spotify_pitch: UrgAns fills in the Spotify editorial pitch
 * (genre, moods, instruments, and the song description) from what the rollout
 * already holds.
 *
 * ONE-SHOT, like release.draft_plan: the fields are a form the manager reads and
 * edits in the task pop-up anyway, so there is no separate card to accept. The
 * run writes them and the pop-up shows them.
 *
 * IT FILLS GAPS AND NEVER OVERWRITES. Only the empty fields are asked for, and
 * the write re-reads the task and merges into whatever is empty NOW
 * (mergeDraftIntoEmpty), so something typed while the model was working is kept.
 *
 * ONLY WHAT THE ROLLOUT KNOWS. The prompt says so in as many words, and the
 * context carries credit ROLES, never names, emails or splits.
 *
 * NO DETERMINISTIC FALLBACK, as with every drafting action: there is no
 * template for a song description. With no model configured, say so.
 *
 * 'team_write': the task pop-up, its routes and the pitch-kit reads all go
 * through team-aware access, so a teammate may run it. Metered by the same
 * embedded-action credits as every other run; Solo is refused by
 * runUrgansAction's entitlement check before this ever runs.
 */

const NOT_CONFIGURED = 'UrgAns cannot write for you yet. Fill this in yourself for now.';
const DEADLINE_MS = 52_000;

type Input = { taskId?: string };
type Output = { taskId: string; fields: PitchFields; filled: PitchFieldKey[] };

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const FORMAT_LABEL: Record<string, string> = { single: 'single', ep: 'EP', album: 'album' };

export const releaseDraftSpotifyPitchAction: UrgansActionDefinition<Input, Output, Output> = {
  id: 'release.draft_spotify_pitch',
  label: 'Draft my Spotify pitch',
  objectTypes: ['release'],
  access: 'team_write',
  promptVersion: 'release-draft-spotify-pitch-v1',
  oneShot: true,

  async execute({ admin, objectId, input }) {
    if (!isAiConfigured()) return { ok: false, status: 503, error: NOT_CONFIGURED };

    const taskId = text(input?.taskId);
    if (!taskId) return { ok: false, status: 400, error: 'Say which pitch task this is for.' };

    // The task has to be THIS rollout's Spotify pitch. A task id from anywhere
    // else gets the same answer as one that does not exist.
    const taskResult = await admin
      .from('tasks')
      .select('id,release_id,metadata')
      .eq('id', taskId)
      .maybeSingle();
    const taskRow = taskResult.error ? null : asRow(taskResult.data);
    if (
      !taskRow ||
      taskRow.release_id !== objectId ||
      !isEditorialPitchTask(readTemplateOrigin(taskRow.metadata).taskId)
    ) {
      return { ok: false, status: 404, error: 'Pitch task not found.' };
    }

    const current = readPitchTaskMeta(taskRow.metadata).fields;
    const wanted = emptyPitchFieldKeys(current);
    if (wanted.length === 0) {
      return { ok: false, status: 400, error: 'Every field is already filled in.' };
    }

    const loaded = await loadPitchKit(admin, objectId);
    if ('error' in loaded) return { ok: false, status: loaded.status, error: loaded.error };
    const { pitchKit } = loaded;

    const [metadataResult, releaseResult] = await Promise.all([
      admin
        .from('release_metadata')
        .select('genre,subgenre,language')
        .eq('release_id', objectId)
        .maybeSingle(),
      admin.from('releases').select('release_type,description').eq('id', objectId).maybeSingle(),
    ]);
    const metadata = asRow(metadataResult.error ? null : metadataResult.data);
    const releaseRow = asRow(releaseResult.error ? null : releaseResult.data);

    const context: PitchContext = {
      ...EMPTY_PITCH_CONTEXT,
      title: pitchKit.release.title,
      artistName: pitchKit.release.artistName,
      format: FORMAT_LABEL[text(releaseRow.release_type)] ?? '',
      genre: text(metadata.genre),
      subgenre: text(metadata.subgenre),
      language: text(metadata.language),
      description: text(releaseRow.description),
      story: pitchKit.fields.story,
      descriptor: pitchKit.kit?.descriptor ?? '',
      shortBio: pitchKit.kit?.shortBio ?? '',
      creditRoles: pitchKit.credits.map((credit) => credit.role).filter(Boolean),
    };

    // Every model call the run makes, retries and hops included, so the run is
    // charged for what it used.
    const collector = createUsageCollector(legacyModelFor('press_kit') ?? null);
    let routed: RoutingTrace | null = null;
    let draft: PitchFields;
    try {
      draft = await generateRoutedStructuredOutput<PitchFields>({
        surface: 'press_kit',
        messages: buildPitchMessages(context, wanted),
        temperature: 0.3,
        parse: (raw) => parsePitchDraftResponse(raw),
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

    // Re-read right before writing: the manager may have typed into a field
    // while the model was working, and that is theirs.
    const latest = await admin.from('tasks').select('metadata').eq('id', taskId).maybeSingle();
    const latestFields = latest.error || !latest.data
      ? current
      : readPitchTaskMeta((latest.data as { metadata: unknown }).metadata).fields;
    const merged = mergeDraftIntoEmpty(latestFields, draft);
    const filled = PITCH_FIELD_KEYS.filter((key) => !latestFields[key].trim() && merged[key].trim());

    if (filled.length > 0) {
      const saved = await savePitchFields(admin, taskId, merged);
      if (!saved) {
        return {
          ok: false,
          status: 500,
          error: 'Could not save the pitch.',
          usageCalls: collector.calls,
          failedCalls: collector.failures,
        };
      }
    }

    const trace = routed as RoutingTrace | null;
    return {
      ok: true,
      output: { taskId, fields: merged, filled },
      inputSummary: {
        taskId,
        wanted,
        filled,
        ...(trace ? { routing: summarizeTrace(trace) } : {}),
      },
      model: trace?.models[trace.models.length - 1] ?? legacyModelFor('press_kit') ?? null,
      tokensIn: sumTokens(collector.calls.map((call) => call.promptTokens)),
      tokensOut: sumTokens(collector.calls.map((call) => call.completionTokens)),
      usageCalls: collector.calls,
      failedCalls: collector.failures,
    };
  },

  // No apply(), no discard(): oneShot means execute() already wrote the fields.
};
