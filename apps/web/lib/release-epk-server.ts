import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
} from '@/lib/asset-helpers';
import {
  creditsFromSubmissions,
  effectiveCredits,
  pitchKitChecklist,
  readStoredFields,
  type ReleaseEpkCredit,
  type ReleaseEpkFields,
} from '@/lib/release-epk';
import { readKitSnapshot, type KitSnapshot } from '@/lib/release-epk-snapshot';

// Reading and writing the release pitch kit. Leaf-only (no app/api imports) so
// the embedded action runner can use it too.
//
// The feature flag is read by the ROUTE and the action, not here: this is the
// data layer.

export const RELEASE_EPK_FIELDS_TABLE = 'release_epk_fields';
const RELEASES_TABLE = 'releases';
const KITS_TABLE = 'press_kits';
const SECTIONS_TABLE = 'press_kit_sections';

export const isPitchKitEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_PITCH_KIT === 'true';

const asRow = (value: unknown): Record<string, unknown> =>
  (value || {}) as Record<string, unknown>;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export type PitchKitSummary = KitSnapshot | null;

export type PitchKitPayload = {
  release: {
    id: string;
    ownerUserId: string;
    title: string;
    artistId: string;
    artistName: string;
    releaseDate: string | null;
  };
  /** The artist's standing kit, read-only here. null = none created yet. */
  kit: PitchKitSummary;
  /** When `kit` was frozen at delivery, or null while it is read live. */
  kitFrozenAt: string | null;
  fields: ReleaseEpkFields;
  /** What collaborators submitted, already narrowed to name and role. */
  submittedCredits: ReleaseEpkCredit[];
  /** What the pitch will actually show. */
  credits: ReleaseEpkCredit[];
  coverUrl: string | null;
  checklist: ReturnType<typeof pitchKitChecklist>;
};

/**
 * The three things a pitch shows from artist kits, one query for all of them.
 * Shared by the live read below and by the delivery sweep, so a frozen copy and
 * a live read can never disagree about what "the kit" means.
 */
export async function readKitSummaries(
  admin: SupabaseClient,
  kitRows: Array<Record<string, unknown>>
): Promise<Map<string, KitSnapshot>> {
  const summaries = new Map<string, KitSnapshot>();
  if (kitRows.length === 0) return summaries;

  const sections = await admin
    .from(SECTIONS_TABLE)
    .select('kit_id,section,content')
    .in('kit_id', kitRows.map((row) => text(row.id)))
    .in('section', ['header', 'bios', 'contact']);
  const sectionRows = sections.error ? [] : (sections.data || []);

  for (const kitRow of kitRows) {
    const kitId = text(kitRow.id);
    const content = (name: string): Record<string, unknown> => {
      const row = sectionRows.find(
        (s) => asRow(s).kit_id === kitId && asRow(s).section === name
      );
      const value = row ? asRow(row).content : null;
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    };
    const contacts = content('contact').contacts;
    summaries.set(text(kitRow.artist_id), {
      id: kitId,
      artistId: text(kitRow.artist_id),
      slug: text(kitRow.slug),
      state: text(kitRow.state),
      publishedAt: kitRow.published_at ? text(kitRow.published_at) : null,
      descriptor: text(content('header').descriptor),
      shortBio: text(content('bios').short),
      contactCount: Array.isArray(contacts) ? contacts.length : 0,
      contactEmail: Array.isArray(contacts) && contacts.length > 0 ? text(asRow(contacts[0]).email) : '',
    });
  }
  return summaries;
}

export async function loadPitchKit(
  admin: SupabaseClient,
  releaseId: string
): Promise<{ error: string; status: number } | { pitchKit: PitchKitPayload }> {
  const releaseResult = await admin
    .from(RELEASES_TABLE)
    .select('id,owner_user_id,title,artist_id,artist_name,release_date,artwork_asset_id')
    .eq('id', releaseId)
    .is('deleted_at', null)
    .maybeSingle();
  if (releaseResult.error) return { error: 'Could not load the rollout.', status: 500 };
  if (!releaseResult.data) return { error: 'Rollout not found.', status: 404 };
  const release = asRow(releaseResult.data);
  const artistId = text(release.artist_id);

  const [fieldsResult, submissionsResult, kitResult] = await Promise.all([
    admin.from(RELEASE_EPK_FIELDS_TABLE).select('*').eq('release_id', releaseId).maybeSingle(),
    admin
      .from('release_credit_submissions')
      .select('legal_name,stage_name,roles')
      .eq('release_id', releaseId)
      .order('created_at', { ascending: true })
      .limit(100),
    artistId
      ? admin
          .from(KITS_TABLE)
          .select('id,artist_id,slug,state,published_at')
          .eq('artist_id', artistId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const fields = readStoredFields(fieldsResult.error ? null : fieldsResult.data);
  const submittedCredits = creditsFromSubmissions(
    submissionsResult.error || !Array.isArray(submissionsResult.data)
      ? []
      : submissionsResult.data.map((row) => {
          const record = asRow(row);
          return {
            legalName: text(record.legal_name),
            stageName: record.stage_name ? text(record.stage_name) : null,
            roles: Array.isArray(record.roles) ? (record.roles as string[]) : [],
          };
        })
  );

  // A delivered release reads the copy frozen when it was delivered; one that
  // has not happened yet reads the artist's live kit, so an edit to the bio
  // reaches it. A snapshot that cannot be read is treated as absent.
  const fieldsRow = fieldsResult.error ? null : asRow(fieldsResult.data);
  const frozen = fieldsRow ? readKitSnapshot(fieldsRow.kit_snapshot) : null;
  const kitFrozenAt = frozen && fieldsRow?.kit_snapshot_at ? text(fieldsRow.kit_snapshot_at) : null;

  let kit: PitchKitSummary = frozen;
  if (!kit) {
    const kitRow = kitResult.error ? null : (kitResult.data as Record<string, unknown> | null);
    if (kitRow) {
      const summaries = await readKitSummaries(admin, [kitRow]);
      kit = summaries.get(text(kitRow.artist_id)) ?? null;
    }
  }

  let coverUrl: string | null = null;
  const assetId = release.artwork_asset_id ? text(release.artwork_asset_id) : '';
  if (assetId) {
    const asset = await admin
      .from('assets')
      .select('storage_bucket,storage_path')
      .eq('id', assetId)
      .maybeSingle();
    const row = asset.error ? null : asRow(asset.data);
    if (row && text(row.storage_path)) {
      coverUrl = await generateSignedUrl(
        admin,
        text(row.storage_bucket) || RELEASE_ASSETS_BUCKET,
        text(row.storage_path),
        ASSET_SIGNED_URL_TTL_SECONDS
      );
    }
  }

  return {
    pitchKit: {
      release: {
        id: text(release.id),
        ownerUserId: text(release.owner_user_id),
        title: text(release.title),
        artistId,
        artistName: text(release.artist_name),
        releaseDate: release.release_date ? text(release.release_date) : null,
      },
      kit,
      kitFrozenAt,
      fields,
      submittedCredits,
      credits: effectiveCredits(fields, submittedCredits),
      coverUrl,
      checklist: pitchKitChecklist({
        fields,
        submittedCredits,
        hasCover: Boolean(coverUrl),
        kitPublished: Boolean(kit?.publishedAt),
      }),
    },
  };
}

/** Upsert a sparse patch. Stamped with the RELEASE owner, never the actor. */
export async function savePitchKitFields(
  admin: SupabaseClient,
  input: {
    releaseId: string;
    ownerUserId: string;
    actorUserId: string;
    patch: Partial<ReleaseEpkFields>;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row: Record<string, unknown> = {
    release_id: input.releaseId,
    owner_user_id: input.ownerUserId,
    updated_by: input.actorUserId,
  };
  if (input.patch.story !== undefined) row.story = input.patch.story;
  if (input.patch.storySource !== undefined) row.story_source = input.patch.storySource;
  if ('credits' in input.patch) row.credits = input.patch.credits;

  const { error } = await admin
    .from(RELEASE_EPK_FIELDS_TABLE)
    .upsert(row, { onConflict: 'release_id' });
  return error ? { ok: false, error: 'Could not save that.' } : { ok: true };
}
