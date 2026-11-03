import type { SupabaseClient } from '@supabase/supabase-js';
import { isAiConfigured } from '@/lib/ai/provider';
import { generateRoutedStructuredOutput } from '@/lib/ai/routed';
import { legacyModelFor, summarizeTrace, type RoutingTrace } from '@/lib/ai/model-router';
import { createUsageCollector, sumTokens } from '@/lib/credits/embedded';
import { deriveSectionStatus } from '@/lib/press-kits';
import { loadPitchKit, savePitchKitFields } from '@/lib/release-epk-server';
import {
  buildFillMessages,
  findGaps,
  hasAnyGap,
  parseFillResponse,
  planFillApply,
  type FillContext,
  type FillDraft,
} from '@/lib/release-epk-fill';
import type { UrgansActionDefinition } from '../types';

/**
 * epk.fill_both: UrgAns fills the gaps in the artist's standing press kit AND
 * the release's own story, in one run.
 *
 * REACHED FROM A RELEASE, which is why the object type is 'release': the kit
 * is found through the release's artist, and a release is the thing the person
 * is standing on. 'team_write' because every route this touches (the pitch kit
 * fields, the kit's sections) already goes through team-aware access, so there
 * is no owner-keyed legacy route underneath waiting to 404 a teammate.
 *
 * IT FILLS GAPS AND NEVER OVERWRITES. The model is only asked for fields that
 * are empty, and apply() re-reads and skips anything that has been filled since
 * (planFillApply). So accepting a draft cannot destroy somebody's edit, and
 * there is no stale-draft refusal to explain.
 *
 * PROSE, NEVER FACTS: the same allowlist as presskit.draft_section. Bios, the
 * one-line descriptor, the release hook and the story. Never numbers, credits,
 * contacts or links.
 *
 * NO DETERMINISTIC FALLBACK, as with the section drafter: there is no template
 * for a bio. With no model configured the honest answer is to say so.
 */

const SECTIONS_TABLE = 'press_kit_sections';
const KITS_TABLE = 'press_kits';
const NOT_CONFIGURED = 'AI cannot write for you yet. Fill this in yourself for now.';
const MAX_NOTES_LENGTH = 2000;
const DEADLINE_MS = 52_000;

type Input = { notes?: string };

type Output = {
  kitId: string | null;
  draft: FillDraft;
  /** Counts for the review card; the draft text itself is the preview. */
  willFill: { kit: number; story: boolean };
};

type Result = { filled: number; skipped: number; kitId: string | null };

const asRow = (value: unknown): Record<string, unknown> =>
  (value || {}) as Record<string, unknown>;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

async function loadSectionContents(
  admin: SupabaseClient,
  kitId: string
): Promise<Record<string, { id: string; content: Record<string, unknown> }> | null> {
  const { data, error } = await admin
    .from(SECTIONS_TABLE)
    .select('id,section,content')
    .eq('kit_id', kitId)
    .in('section', ['header', 'bios', 'latest_release']);
  if (error || !Array.isArray(data)) return null;
  const out: Record<string, { id: string; content: Record<string, unknown> }> = {};
  for (const row of data) {
    const record = asRow(row);
    out[text(record.section)] = { id: text(record.id), content: obj(record.content) };
  }
  return out;
}

export const epkFillBothAction: UrgansActionDefinition<Input, Output, Result> = {
  id: 'epk.fill_both',
  label: 'Fill the press kit and the pitch',
  objectTypes: ['release'],
  access: 'team_write',
  promptVersion: 'epk-fill-both-v1',

  async execute({ admin, objectId, input }) {
    if (!isAiConfigured()) return { ok: false, status: 503, error: NOT_CONFIGURED };

    const loaded = await loadPitchKit(admin, objectId);
    if ('error' in loaded) return { ok: false, status: loaded.status, error: loaded.error };
    const { pitchKit } = loaded;

    const sections = pitchKit.kit ? await loadSectionContents(admin, pitchKit.kit.id) : null;
    const kitExists = Boolean(pitchKit.kit && sections);

    const target = findGaps({
      kitExists,
      header: sections?.header?.content ?? {},
      bios: sections?.bios?.content ?? {},
      latestRelease: sections?.latest_release?.content ?? {},
      releaseId: objectId,
      story: pitchKit.fields.story,
    });
    if (!hasAnyGap(target)) {
      return { ok: false, status: 400, error: 'There is nothing left to fill in. It is all written.' };
    }

    const metadataResult = await admin
      .from('release_metadata')
      .select('genre')
      .eq('release_id', objectId)
      .maybeSingle();
    const releaseRow = await admin
      .from('releases')
      .select('release_type,description')
      .eq('id', objectId)
      .maybeSingle();

    const header = sections?.header?.content ?? {};
    const bios = sections?.bios?.content ?? {};
    const context: FillContext = {
      artistName: pitchKit.release.artistName,
      genres: text(header.genreTags),
      homeCity: text(header.homeCity),
      descriptor: text(header.descriptor),
      existingBios: { short: text(bios.short), medium: text(bios.medium), long: text(bios.long) },
      release: {
        title: pitchKit.release.title,
        releaseType: text(asRow(releaseRow.data).release_type),
        releaseDate: pitchKit.release.releaseDate ?? '',
        description: text(asRow(releaseRow.data).description),
        genre: text(asRow(metadataResult.data).genre),
      },
      credits: pitchKit.credits,
      existingStory: pitchKit.fields.story,
    };
    const notes = text(input?.notes).slice(0, MAX_NOTES_LENGTH);

    // Every model call the run makes, retries and hops included, so the run is
    // charged for what it used (credits/embedded.ts). This kept only the LAST
    // usage and returned no calls, so a Fill both run reported tokens but was
    // charged as a run that made none.
    const collector = createUsageCollector(legacyModelFor('press_kit') ?? null);
    let routed: RoutingTrace | null = null;
    let draft: FillDraft;
    try {
      draft = await generateRoutedStructuredOutput<FillDraft>({
        surface: 'press_kit',
        messages: buildFillMessages(target, context, notes),
        temperature: 0.4,
        parse: (raw) => parseFillResponse(target, raw),
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
        error: 'AI could not write that just now. Try again.',
        usageCalls: collector.calls,
        failedCalls: collector.failures,
      };
    }

    const trace = routed as RoutingTrace | null;
    const kitFields =
      Object.values(draft.kit.header ?? {}).length +
      Object.values(draft.kit.bios ?? {}).length +
      Object.values(draft.kit.latest_release ?? {}).length;

    return {
      ok: true,
      output: {
        kitId: pitchKit.kit?.id ?? null,
        draft,
        willFill: { kit: kitFields, story: Boolean(draft.story) },
      },
      inputSummary: {
        kitFields,
        story: Boolean(draft.story),
        hasNotes: notes.length > 0,
        ...(trace ? { routing: summarizeTrace(trace) } : {}),
      },
      model: trace?.models[trace.models.length - 1] ?? legacyModelFor('press_kit') ?? null,
      tokensIn: sumTokens(collector.calls.map((call) => call.promptTokens)),
      tokensOut: sumTokens(collector.calls.map((call) => call.completionTokens)),
      usageCalls: collector.calls,
      failedCalls: collector.failures,
    };
  },

  async apply({ admin, objectId, actor, ownerUserId, output }) {
    const prepared = output as Output | null;
    if (!prepared?.draft) {
      return { ok: false, status: 400, error: 'There is nothing to accept.' };
    }

    // Re-read EVERYTHING now: the draft only fills what is still empty.
    const loaded = await loadPitchKit(admin, objectId);
    if ('error' in loaded) return { ok: false, status: loaded.status, error: loaded.error };
    const kitId = loaded.pitchKit.kit?.id ?? null;
    const sections = kitId ? await loadSectionContents(admin, kitId) : null;

    const plan = planFillApply(prepared.draft, {
      header: sections?.header?.content ?? {},
      bios: sections?.bios?.content ?? {},
      latestRelease: sections?.latest_release?.content ?? {},
      story: loaded.pitchKit.fields.story,
    });

    if (sections && kitId) {
      for (const [key, content] of Object.entries(plan.sections)) {
        const row = sections[key];
        if (!row || !content) continue;
        const { error } = await admin
          .from(SECTIONS_TABLE)
          .update({
            content,
            status: deriveSectionStatus(
              key as 'header' | 'bios' | 'latest_release',
              content,
              { photoCount: 0 }
            ),
            // 'ai', not 'user': a person accepted it but did not write it, and
            // autofill must still leave it alone from here on.
            source: 'ai',
          })
          .eq('id', row.id);
        if (error) return { ok: false, status: 500, error: 'Could not save the press kit.' };
      }
      if (Object.keys(plan.sections).length > 0) {
        await admin.from(KITS_TABLE).update({ updated_at: new Date().toISOString() }).eq('id', kitId);
      }
    }

    if (plan.story) {
      const saved = await savePitchKitFields(admin, {
        releaseId: objectId,
        ownerUserId,
        actorUserId: actor.id,
        patch: { story: plan.story, storySource: 'ai' },
      });
      if (!saved.ok) return { ok: false, status: 500, error: saved.error };
    }

    return { ok: true, result: { filled: plan.filled, skipped: plan.skipped, kitId } };
  },

  async discard() {
    // Nothing was written, so there is nothing to undo.
    return { ok: true };
  },
};
