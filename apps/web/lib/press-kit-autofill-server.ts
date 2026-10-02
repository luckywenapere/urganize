import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveSectionStatus } from '@/lib/press-kits';
import { loadWorkspaceMembers } from '@/lib/tasks-server';
import { readStoredFields } from '@/lib/release-epk';
import { RELEASE_EPK_FIELDS_TABLE, isPitchKitEnabled } from '@/lib/release-epk-server';
import {
  buildAutofillPatch,
  summarizeSources,
  type AutofillCredit,
  type AutofillRelease,
  type AutofillShow,
  type AutofillSong,
  type AutofillSources,
  type AutofillSummary,
} from '@/lib/press-kit-autofill';
import type { PressKitSection } from '@/types/press-kits';

/**
 * Reading what Urganize already knows about an artist, so a new press kit is
 * never shown as twelve empty boxes.
 *
 * Shaped after lib/epk-server.ts:loadPublicEpk, which is the house pattern for
 * an assembly like this and already has two adopters: one Promise.all for
 * everything independent, tolerance PER SOURCE rather than all-or-nothing, and
 * a try/catch around the whole body. NEVER THROWS. A failed credits read gives
 * a kit without credits, not a failed kit.
 *
 * The shaping lives in lib/press-kit-autofill.ts, which is pure and tested.
 * This file only fetches.
 *
 * NOTE this module must never import app/api/releases/_shared.ts: it still
 * carries the deprecated schema-missing helpers, and
 * lib/schema-fallback-guard.test.ts fails the build for a new file that does.
 * That is why the metadata columns are selected and mapped here by hand rather
 * than through toMetadataSnapshot.
 */

const RELEASE_COLUMNS =
  'id,title,release_type,release_date,description,artist_id';

const METADATA_COLUMNS = 'release_id,genre,subgenre';

/** Only what may appear on a page anyone with the link can read. The
 *  submissions row also holds an email, a phone number, a PRO affiliation, an
 *  IPI number and both splits; this select is the first guard against any of it
 *  reaching a public kit, and buildAutofillPatch rebuilding each entry field by
 *  field is the second. */
const CREDIT_COLUMNS = 'legal_name,stage_name,roles,contribution';

const SHOW_COLUMNS = 'title,venue_name,set_start_at,timezone,artist_id,status';

const SONG_COLUMNS_LOCAL = 'id,title,release_id,duration_seconds,artist_id';

/** A roster's whole history, well above any real one. Matches EVENTS_LIST_LIMIT
 *  in spirit: a ceiling against a runaway, not a page size. */
const SOURCE_LIMIT = 200;

const asRow = (value: unknown): Record<string, unknown> =>
  (value || {}) as Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const EMPTY_SOURCES: AutofillSources = {
  releases: [],
  metadata: null,
  songs: [],
  credits: [],
  shows: [],
  members: [],
};

export type LoadSourcesInput = {
  artistId: string;
  /** The kit's owner, which is the ARTIST's owner rather than whoever is
   *  signed in. Members are read against their team. */
  workspaceId: string;
  ownerUserId: string;
};

/**
 * Everything an artist's kit can be filled from, gathered in as few round trips
 * as the dependencies allow.
 *
 * Releases are read first because the credits and the metadata both hang off
 * whichever release is newest; everything after that goes out together.
 */
export async function loadPressKitSources(
  adminClient: SupabaseClient,
  { artistId, workspaceId, ownerUserId }: LoadSourcesInput
): Promise<AutofillSources> {
  if (!artistId) return EMPTY_SOURCES;

  try {
    const releaseResult = await adminClient
      .from('releases')
      .select(RELEASE_COLUMNS)
      .eq('artist_id', artistId)
      .order('release_date', { ascending: false, nullsFirst: false })
      .limit(SOURCE_LIMIT);

    const releases: AutofillRelease[] = releaseResult.error
      ? []
      : (releaseResult.data || []).map((row) => {
          const record = asRow(row);
          return {
            id: text(record.id),
            title: text(record.title),
            releaseType: text(record.release_type),
            releaseDate: record.release_date ? text(record.release_date) : null,
            description: text(record.description),
          };
        });

    // The newest DATED release, matching what buildAutofillPatch will pick, so
    // the metadata and the credits describe the release the kit is about.
    const anchor =
      releases.find((release) => release.releaseDate) || releases[0] || null;

    const [metadataResult, songResult, creditResult, showResult, members, pitchKitResult] = await Promise.all([
      anchor
        ? adminClient
            .from('release_metadata')
            .select(METADATA_COLUMNS)
            .eq('release_id', anchor.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      adminClient
        .from('songs')
        .select(SONG_COLUMNS_LOCAL)
        .eq('artist_id', artistId)
        .order('title', { ascending: true })
        .limit(SOURCE_LIMIT),
      anchor
        ? adminClient
            .from('release_credit_submissions')
            .select(CREDIT_COLUMNS)
            .eq('release_id', anchor.id)
            .order('created_at', { ascending: true })
            .limit(SOURCE_LIMIT)
        : Promise.resolve({ data: [], error: null }),
      adminClient
        .from('events')
        .select(SHOW_COLUMNS)
        .eq('artist_id', artistId)
        .neq('status', 'cancelled')
        .order('set_start_at', { ascending: false, nullsFirst: false })
        .limit(SOURCE_LIMIT),
      // The one read here that THROWS rather than returning an error, so it
      // gets its own catch: a team we cannot read costs the contact block, not
      // the whole fill.
      loadWorkspaceMembers(adminClient, workspaceId, ownerUserId).catch(() => []),
      // The rollout's own story and credits, when the pitch kit is switched on.
      // A missing table or a failed read costs only this feed: a kit without a
      // story is a working kit.
      anchor && isPitchKitEnabled()
        ? adminClient
            .from(RELEASE_EPK_FIELDS_TABLE)
            .select('story,story_source,credits')
            .eq('release_id', anchor.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const metadataRow =
      metadataResult && !metadataResult.error ? asRow(metadataResult.data) : null;

    const songs: AutofillSong[] =
      songResult.error || !Array.isArray(songResult.data)
        ? []
        : songResult.data.map((row) => {
            const record = asRow(row);
            return {
              id: text(record.id),
              title: text(record.title),
              releaseId: record.release_id ? text(record.release_id) : null,
              durationSeconds:
                typeof record.duration_seconds === 'number' ? record.duration_seconds : null,
            };
          });

    const credits: AutofillCredit[] =
      creditResult.error || !Array.isArray(creditResult.data)
        ? []
        : creditResult.data.map((row) => {
            const record = asRow(row);
            return {
              legalName: text(record.legal_name),
              stageName: record.stage_name ? text(record.stage_name) : null,
              roles: Array.isArray(record.roles) ? (record.roles as string[]) : [],
              contribution: record.contribution ? text(record.contribution) : null,
            };
          });

    const pitchFields =
      anchor && pitchKitResult && !pitchKitResult.error && pitchKitResult.data
        ? readStoredFields(pitchKitResult.data)
        : null;

    const shows: AutofillShow[] =
      showResult.error || !Array.isArray(showResult.data)
        ? []
        : showResult.data.map((row) => {
            const record = asRow(row);
            return {
              title: text(record.title),
              venueName: record.venue_name ? text(record.venue_name) : null,
              startAt: record.set_start_at ? text(record.set_start_at) : null,
              timezone: text(record.timezone) || 'Africa/Lagos',
            };
          });

    return {
      releases,
      metadata: metadataRow
        ? {
            genre: metadataRow.genre ? text(metadataRow.genre) : null,
            subgenre: metadataRow.subgenre ? text(metadataRow.subgenre) : null,
          }
        : null,
      songs,
      credits,
      shows,
      pitchKit:
        anchor && pitchFields
          ? { releaseId: anchor.id, story: pitchFields.story, credits: pitchFields.credits }
          : null,
      members: (members || []).map((member) => ({
        name: text(member.name),
        email: text(member.email),
      })),
    };
  } catch {
    // A kit with empty sections is a working kit. Nothing here is worth
    // failing a create over.
    return EMPTY_SOURCES;
  }
}

export type AutofillResult = {
  summary: AutofillSummary;
  /** Which sections were actually written. */
  filled: string[];
};

/**
 * Fill what can be filled, and leave everything else alone.
 *
 * `source` deliberately stays 'autofill' on a section this writes, so running
 * it again refreshes it. It is a person typing, or UrgAns drafting, that moves
 * a section out of reach — see buildAutofillPatch.
 */
export async function applyAutofill(
  adminClient: SupabaseClient,
  input: LoadSourcesInput & { kitId: string; sections: readonly PressKitSection[] }
): Promise<AutofillResult> {
  const sources = await loadPressKitSources(adminClient, input);
  const patches = buildAutofillPatch(sources, input.sections);
  const filled: string[] = [];

  for (const patch of patches) {
    const { error } = await adminClient
      .from('press_kit_sections')
      .update({
        content: patch.content,
        status: deriveSectionStatus(patch.section, patch.content, { photoCount: 0 }),
      })
      .eq('kit_id', input.kitId)
      .eq('section', patch.section)
      // Belt and braces against a race: the guard already ran in
      // buildAutofillPatch, and this makes the database refuse a write to a
      // section somebody touched in between.
      .eq('source', 'autofill');

    if (!error) filled.push(patch.section);
  }

  return { summary: summarizeSources(sources), filled };
}
