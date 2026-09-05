import type { AiUsage } from '@/lib/ai/provider';
import { generateStructuredAiOutput, isAiConfigured } from '@/lib/ai/provider';
import { deriveSectionStatus } from '@/lib/press-kits';
import { applyAnswerToContent } from '@/lib/press-kit-interview';
import {
  buildDraftContext,
  buildDraftMessages,
  decideDraftApply,
  isDraftableSection,
  parseDraftOutput,
} from '@/lib/press-kit-draft';
import {
  PRESS_KIT_COLUMNS,
  PRESS_KITS_TABLE,
} from '@/lib/press-kit-access-server';
import type { PressKitSectionContent, PressKitSectionKey } from '@/types/press-kits';
import type { UrgansActionDefinition } from '../types';

/**
 * presskit.draft_section — UrgAns writes one section, and nothing is saved
 * until a person accepts it.
 *
 * The second embedded action, and the first on an object that is not a
 * release. It is 'team_write' rather than release.draft_plan's 'owner_write',
 * and that is honest rather than a copy: every press kit route already goes
 * through ensurePressKitAccess, so a teammate who may edit the kit may also
 * ask UrgAns to draft into it, and there is no owner-keyed legacy route
 * underneath waiting to 404 them.
 *
 * UNLIKE release.draft_plan, apply() USES the output it is handed. That action
 * ignores its own `output` and re-reads release_plan_drafts, because the plan
 * is a document under its own autosave. A section draft is not: it lives in
 * the urgans_actions row between the run and the accept, which is exactly what
 * "propose, do not write" means here.
 *
 * NO DETERMINISTIC FALLBACK, deliberately. release.draft_plan degrades to the
 * untailored playbook when no model is configured, because a template plan is
 * still a real plan. There is no template for a bio: the honest answer with no
 * model is to say so and leave the manual builder and the interview, which is
 * the whole no-AI path this feature already ships.
 */

const SECTIONS_TABLE = 'press_kit_sections';
const SECTION_COLUMNS = 'id,kit_id,section,content,status,source,updated_at';

const NOT_CONFIGURED =
  'UrgAns cannot write for you yet. Fill this in yourself for now.';

const MAX_NOTES_LENGTH = 2000;

type Input = {
  section: PressKitSectionKey;
  /** A rough paragraph from the manager, in their own words. Most people will
   *  not write clean copy, which is the whole reason this is offered. */
  notes?: string;
};

type Output = {
  section: PressKitSectionKey;
  content: PressKitSectionContent;
  /** The section's updated_at as it was when the draft was made. apply()
   *  refuses if it has moved, so accepting a stale draft cannot quietly
   *  destroy an edit somebody made in between. */
  sectionUpdatedAt: string;
};

type Result = { section: PressKitSectionKey; content: PressKitSectionContent };

const asRow = (value: unknown): Record<string, unknown> =>
  (value || {}) as Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const toSection = (row: Record<string, unknown>) => ({
  id: text(row.id),
  section: row.section as PressKitSectionKey,
  content:
    row.content && typeof row.content === 'object' && !Array.isArray(row.content)
      ? (row.content as PressKitSectionContent)
      : {},
  publishedContent: null,
  status: (row.status as 'empty' | 'draft' | 'ready') || 'empty',
  source: (row.source as 'autofill' | 'ai' | 'user') || 'autofill',
  position: 0,
  hidden: false,
  updatedBy: null,
  updatedAt: text(row.updated_at),
});

export const pressKitDraftSectionAction: UrgansActionDefinition<Input, Output, Result> = {
  id: 'presskit.draft_section',
  label: 'Draft this section',
  objectTypes: ['press_kit'],
  access: 'team_write',
  promptVersion: 'presskit-draft-v1',

  async execute({ admin, objectId, input }) {
    const section = input?.section;
    if (!section || !isDraftableSection(section)) {
      return { ok: false, status: 400, error: 'UrgAns does not write that part of a kit.' };
    }

    if (!isAiConfigured()) {
      return { ok: false, status: 503, error: NOT_CONFIGURED };
    }

    const kitResult = await admin
      .from(PRESS_KITS_TABLE)
      .select(PRESS_KIT_COLUMNS)
      .eq('id', objectId)
      .maybeSingle();
    if (kitResult.error || !kitResult.data) {
      return { ok: false, status: 404, error: 'Press kit not found.' };
    }
    const artistId = text(asRow(kitResult.data).artist_id);

    const [sectionsResult, artistResult] = await Promise.all([
      admin.from(SECTIONS_TABLE).select(SECTION_COLUMNS).eq('kit_id', objectId),
      admin.from('artists').select('name').eq('id', artistId).maybeSingle(),
    ]);

    if (sectionsResult.error) {
      return { ok: false, status: 500, error: 'Could not read the press kit.' };
    }

    const sections = (sectionsResult.data || []).map((row) => toSection(asRow(row)));
    const target = sections.find((entry) => entry.section === section);
    if (!target) {
      return { ok: false, status: 404, error: 'That section is not set up yet.' };
    }

    const context = buildDraftContext(text(asRow(artistResult.data).name), sections);
    const notes = text(input?.notes).slice(0, MAX_NOTES_LENGTH);

    let usage: AiUsage | null = null;
    let content: PressKitSectionContent;
    try {
      content = await generateStructuredAiOutput<PressKitSectionContent>({
        messages: buildDraftMessages(section, context, notes),
        // Press copy that reads the same twice is worth more than a surprising
        // turn of phrase, and a redraft is one tap away when it is flat.
        temperature: 0.4,
        model: process.env.AI_PRESSKIT_MODEL || process.env.AI_STATUS_MODEL || undefined,
        parse: (raw) => parseDraftOutput(section, raw),
        onUsage: (reported) => {
          usage = reported;
        },
      });
    } catch {
      return {
        ok: false,
        status: 502,
        error: 'UrgAns could not write that just now. Try again.',
      };
    }

    return {
      ok: true,
      output: { section, content, sectionUpdatedAt: target.updatedAt },
      // The section and whether there were notes, never the draft itself: the
      // copy is edited after this and the log would go stale immediately.
      inputSummary: { section, hasNotes: notes.length > 0 },
      model: process.env.AI_PRESSKIT_MODEL || process.env.AI_STATUS_MODEL || null,
      tokensIn: usage ? (usage as AiUsage).promptTokens : null,
      tokensOut: usage ? (usage as AiUsage).completionTokens : null,
    };
  },

  async apply({ admin, objectId, output }) {
    const draft = output as Output | null;
    if (!draft?.section || !draft.content) {
      return { ok: false, status: 400, error: 'There is nothing to accept.' };
    }

    const current = await admin
      .from(SECTIONS_TABLE)
      .select(SECTION_COLUMNS)
      .eq('kit_id', objectId)
      .eq('section', draft.section)
      .maybeSingle();

    if (current.error || !current.data) {
      return { ok: false, status: 404, error: 'That section is not set up yet.' };
    }

    const existing = toSection(asRow(current.data));

    const decision = decideDraftApply({
      draftedUpdatedAt: draft.sectionUpdatedAt,
      currentUpdatedAt: existing.updatedAt,
    });
    if (!decision.ok) {
      return { ok: false, status: 409, error: decision.error };
    }

    // MERGED, not replaced, for the same reason the interview merges: a draft
    // of the bios must not blank a field it did not produce, and the section
    // carries values from autofill that no draft asked about.
    const content = applyAnswerToContent(existing.content, draft.content);

    const { error } = await admin
      .from(SECTIONS_TABLE)
      .update({
        content,
        status: deriveSectionStatus(draft.section, content, { photoCount: 0 }),
        // 'ai', not 'user': a person accepted this, but they did not write it,
        // and autofill must still leave it alone from here on.
        source: 'ai',
      })
      .eq('id', existing.id);

    if (error) {
      return { ok: false, status: 500, error: 'Could not save that draft.' };
    }

    return { ok: true, result: { section: draft.section, content } };
  },

  async discard() {
    // Nothing was written, so there is nothing to undo. Idempotent by being
    // empty rather than by checking.
    return { ok: true };
  },
};
