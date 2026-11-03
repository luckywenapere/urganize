import { createUsageCollector, sumTokens } from '@/lib/credits/embedded';
import { isAiConfigured } from '@/lib/ai/provider';
import { generateRoutedStructuredOutput } from '@/lib/ai/routed';
import { legacyModelFor, summarizeTrace, type RoutingTrace } from '@/lib/ai/model-router';
import {
  buildDirectoryBioContext,
  buildDirectoryBioMessages,
  decideBioApply,
  parseDirectoryBioAiResponse,
  type DirectoryBioDraft,
} from '@/lib/directory-bio';
import type { DirectoryRole } from '@/lib/directory-roles';
import { profileRoles } from '@/lib/person-profile';
import { resolveProfileView } from '@/lib/profile-kit';
import { loadKitFactsForUser } from '@/lib/profile-kit-server';
import type { UrgansActionDefinition } from '../types';

/**
 * directory.draft_bio: UrgAns drafts the bio on a person's own directory
 * profile, and nothing is saved until they accept it.
 *
 * The third embedded action, and the first on an object that belongs to one
 * person rather than a team. So its access level is 'owner_write' in the only
 * sense that makes sense here: resolveActionScope's person_profile branch
 * admits the profile's own user and nobody else.
 *
 * Draft, then accept, exactly as presskit.draft_section does it: the draft
 * lives in the urgans_actions row between the run and the accept, apply()
 * USES the output it is handed, and a section edited in between refuses the
 * accept rather than silently destroying the edit.
 *
 * It is written from VERIFIED work (delivery records, which nothing here can
 * touch) and, for an artist, their published press kit. The model is told to
 * use only those facts and never to call claimed work delivered; the answer is
 * checked against an allowlist of one field (lib/directory-bio.ts).
 *
 * NO DETERMINISTIC FALLBACK, deliberately, for the reason the press kit action
 * records: there is no template for a bio. With no model the honest answer is
 * to say so and leave the hand-written field.
 */

const PROFILES_TABLE = 'person_profiles';
const RECORDS_TABLE = 'delivery_records';
const PROFILE_COLUMNS = 'id,user_id,display_name,roles,city,country,bio,links,updated_at';

const NOT_CONFIGURED = 'AI cannot write for you yet. Write it yourself for now.';
const MAX_NOTES_LENGTH = 2000;
const DRAFT_DEADLINE_MS = 52_000;

type Input = {
  /** A rough line from the person, in their own words. */
  notes?: string;
};

type Output = {
  bio: string;
  /** The bio as it was when the draft was made. apply() refuses if it has
   *  changed, so accepting a stale draft cannot destroy a hand edit. */
  bioWhenDrafted: string;
};

type Result = { bio: string };

const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export const directoryDraftBioAction: UrgansActionDefinition<Input, Output, Result> = {
  id: 'directory.draft_bio',
  label: 'Draft my bio',
  objectTypes: ['person_profile'],
  access: 'owner_write',
  promptVersion: 'directory-bio-v1',

  async execute({ admin, objectId, actor, input }) {
    if (!isAiConfigured()) {
      return { ok: false, status: 503, error: NOT_CONFIGURED };
    }

    const profileResult = await admin
      .from(PROFILES_TABLE)
      .select(PROFILE_COLUMNS)
      .eq('id', objectId)
      .eq('user_id', actor.id)
      .maybeSingle();
    if (profileResult.error || !profileResult.data) {
      return { ok: false, status: 404, error: 'Profile not found.' };
    }
    const profile = asRow(profileResult.data);

    const [recordsResult, kit] = await Promise.all([
      admin.from(RECORDS_TABLE).select('role').eq('user_id', actor.id),
      loadKitFactsForUser(admin, actor.id),
    ]);

    const claimed = Array.isArray(profile.roles) ? (profile.roles as DirectoryRole[]) : [];

    // An artist whose published kit already supplies the bio shows THAT bio in
    // the directory (lib/profile-kit.ts), so a draft written here would never
    // be seen. Say where to write it instead of spending credits on it.
    const view = resolveProfileView(
      {
        bio: text(profile.bio) || null,
        city: text(profile.city) || null,
        country: null,
        links: [],
      },
      kit
    );
    if (view.fromKit.bio && view.kit) {
      return {
        ok: false,
        status: 409,
        error: `Your directory bio comes from ${view.kit.artistName}'s press kit. Write it there.`,
      };
    }

    const delivered = profileRoles(
      claimed,
      (recordsResult.error ? [] : recordsResult.data || []).map((entry) => ({
        role: text(asRow(entry).role) as DirectoryRole,
      }))
    );

    const context = buildDirectoryBioContext({
      displayName: text(profile.display_name),
      claimedRoles: claimed,
      delivered,
      city: text(profile.city) || null,
      country: text(profile.country) || null,
      existingBio: text(profile.bio),
      kit,
    });
    const notes = text(input?.notes).slice(0, MAX_NOTES_LENGTH);

    // Every model call the run makes, retries and hops included (credits/embedded.ts).
    const collector = createUsageCollector(legacyModelFor('press_kit') ?? null);
    let routed: RoutingTrace | null = null;
    let draft: DirectoryBioDraft;
    try {
      draft = await generateRoutedStructuredOutput<DirectoryBioDraft>({
        surface: 'press_kit',
        messages: buildDirectoryBioMessages(context, notes),
        temperature: 0.4,
        parse: (raw) => parseDirectoryBioAiResponse(raw),
        deadlineMs: Date.now() + DRAFT_DEADLINE_MS,
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
    return {
      ok: true,
      output: { bio: draft.bio, bioWhenDrafted: text(profile.bio) },
      // Whether there were notes and whether an artist page fed it, never the
      // draft itself: the copy is edited after this and the log would go stale.
      inputSummary: {
        hasNotes: notes.length > 0,
        hasKit: Boolean(kit),
        verifiedRoles: context.verified.length,
        ...(trace ? { routing: summarizeTrace(trace) } : {}),
      },
      model: trace?.models[trace.models.length - 1] ?? legacyModelFor('press_kit') ?? null,
      tokensIn: sumTokens(collector.calls.map((call) => call.promptTokens)),
      tokensOut: sumTokens(collector.calls.map((call) => call.completionTokens)),
      usageCalls: collector.calls,
      failedCalls: collector.failures,
    };
  },

  async apply({ admin, objectId, actor, output }) {
    const draft = output as Output | null;
    if (!draft?.bio) {
      return { ok: false, status: 400, error: 'There is nothing to accept.' };
    }

    const current = await admin
      .from(PROFILES_TABLE)
      .select('id,bio')
      .eq('id', objectId)
      .eq('user_id', actor.id)
      .maybeSingle();
    if (current.error || !current.data) {
      return { ok: false, status: 404, error: 'Profile not found.' };
    }

    const decision = decideBioApply({
      bioWhenDrafted: draft.bioWhenDrafted,
      currentBio: text(asRow(current.data).bio),
    });
    if (!decision.ok) {
      return { ok: false, status: 409, error: decision.error };
    }

    // The bio and nothing else, scoped to the actor's own row as well as the id.
    const { error } = await admin
      .from(PROFILES_TABLE)
      .update({ bio: draft.bio })
      .eq('id', objectId)
      .eq('user_id', actor.id);
    if (error) {
      return { ok: false, status: 500, error: 'Could not save that draft.' };
    }

    return { ok: true, result: { bio: draft.bio } };
  },

  async discard() {
    // Nothing was written, so there is nothing to undo.
    return { ok: true };
  },
};
