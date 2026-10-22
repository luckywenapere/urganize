import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/app/api/_shared/auth';
import type { AssetCategory } from '@/lib/asset-constants';
import {
  CAPTURE_BUTTON_LABEL_MAX,
  CAPTURE_CONSENT_NOTE_MAX,
  CAPTURE_HEADLINE_MAX,
  CAPTURE_INCENTIVE_MAX,
  CAPTURE_SHORT_FIELD_MAX,
  type CapturePageDraft,
  type ReleaseCaptureLead,
  type ReleaseCapturePage,
} from '@/types/capture';

// Shared helpers for the fan-capture route group (2026-08-14): table
// constants, the feature flag check, row mappers, draft normalization, and the
// local ownership check. No schema-missing fallback here on purpose:
// environments are assumed migrated (CLAUDE.md "Patterns being deprecated in
// v1"); a missing table surfaces as a normal 500.

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here so
// this group's import sites stay stable (the releases/_shared.ts convention).
export {
  getAuthenticatedUser,
  requireActiveAuthenticatedUser,
  requireAuthenticatedAdmin,
  createAdminClient,
} from '@/app/api/_shared/auth';

// Release access is the shared team-aware pair (whole-workspace visibility;
// guests read-only on writes) — re-exported so this group's import sites
// stay stable, same convention as the auth helpers above.
export {
  ensureReleaseTeamReadAccess,
  ensureReleaseTeamWriteAccess,
} from '@/lib/release-access-server';

export const RELEASE_CAPTURE_PAGES_TABLE = 'release_capture_pages';
export const RELEASE_CAPTURE_LEADS_TABLE = 'release_capture_leads';

export const CAPTURE_PAGE_COLUMNS =
  'id,release_id,share_token,headline,incentive,destination_url,destination_label,button_label,graphic_asset_id,collect_name,consent_note,is_paused,created_at,updated_at';

export const CAPTURE_LEAD_COLUMNS = 'id,email,name,consented,created_at';

/** The only asset categories a public capture page may render. */
export const PUBLIC_IMAGE_ASSET_CATEGORIES: readonly AssetCategory[] = ['cover_art', 'promo_image'];

/**
 * How many leads the owner GET returns.
 *
 * The scene renders a recent list plus a total count, and the export builds
 * its CSV from what is already loaded — so this is the export ceiling too, and
 * it is generous for the scale this product is built for. A page that ever
 * exceeds it needs a paged export, not a bigger number here.
 */
export const CAPTURE_LEADS_PAGE_SIZE = 500;

/**
 * Hard ceiling on leads per page, enforced by the public POST.
 *
 * The token is the only access control on that endpoint, so an unbounded
 * table is one leaked link away from being someone else's storage. A real
 * campaign for the artists this product serves lands far under this.
 */
export const MAX_CAPTURE_LEADS_PER_PAGE = 5000;

// Feature flag: the whole capture surface stays dark until
// NEXT_PUBLIC_FEATURE_CAPTURE is 'true'. Every handler checks this first and
// 404s when off, so direct API calls cannot reach the feature either (the EPK
// route precedent). The public /capture/[token] page checks the same flag and
// notFound()s.
export const isCaptureFeatureEnabled = (): boolean =>
  (process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true' || process.env.NEXT_PUBLIC_FEATURE_ALTLINK !== 'false');

// 18 random bytes → 24 URL-safe chars. Unguessable; the token IS the access
// control for the public page, so it must never be derivable from ids.
export const generateShareToken = (): string => randomBytes(18).toString('base64url');

export const toReleaseCapturePage = (row: Record<string, unknown>): ReleaseCapturePage => ({
  id: String(row.id || ''),
  releaseId: String(row.release_id || ''),
  shareToken: String(row.share_token || ''),
  headline: String(row.headline || ''),
  incentive: String(row.incentive || ''),
  destinationUrl: String(row.destination_url || ''),
  destinationLabel: String(row.destination_label || ''),
  buttonLabel: String(row.button_label || ''),
  graphicAssetId: String(row.graphic_asset_id || ''),
  collectName: row.collect_name === true,
  consentNote: String(row.consent_note || ''),
  isPaused: row.is_paused === true,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
});

export const toReleaseCaptureLead = (row: Record<string, unknown>): ReleaseCaptureLead => ({
  id: String(row.id || ''),
  email: String(row.email || ''),
  name: String(row.name || ''),
  consented: row.consented === true,
  createdAt: String(row.created_at || ''),
});

const readCapped = (value: unknown, max: number): string =>
  String(value ?? '')
    .trim()
    .slice(0, max);

/**
 * Normalize a PATCH body into a full draft.
 *
 * Deliberately a FULL read, not a sparse merge: the editor always sends the
 * whole draft, and a sparse body would make "clear the incentive" and "don't
 * touch the incentive" indistinguishable — the exact trap CLAUDE.md records
 * the Chappi tools hitting on the metadata PATCH. Every field is re-read from
 * the request rather than trusted, since this is the boundary.
 */
export function normalizeCaptureDraft(body: unknown): CapturePageDraft {
  const input = (body ?? {}) as Record<string, unknown>;
  return {
    headline: readCapped(input.headline, CAPTURE_HEADLINE_MAX),
    incentive: readCapped(input.incentive, CAPTURE_INCENTIVE_MAX),
    destinationUrl: readCapped(input.destinationUrl, CAPTURE_SHORT_FIELD_MAX),
    destinationLabel: readCapped(input.destinationLabel, CAPTURE_SHORT_FIELD_MAX),
    buttonLabel: readCapped(input.buttonLabel, CAPTURE_BUTTON_LABEL_MAX),
    graphicAssetId: readCapped(input.graphicAssetId, CAPTURE_SHORT_FIELD_MAX),
    collectName: input.collectName === true,
    consentNote: readCapped(input.consentNote, CAPTURE_CONSENT_NOTE_MAX),
    isPaused: input.isPaused === true,
  };
}

/** Draft → column names, for insert and update alike. */
export function captureDraftToRow(draft: CapturePageDraft): Record<string, unknown> {
  return {
    headline: draft.headline || null,
    incentive: draft.incentive || null,
    destination_url: draft.destinationUrl || null,
    destination_label: draft.destinationLabel || null,
    button_label: draft.buttonLabel || null,
    graphic_asset_id: draft.graphicAssetId || null,
    collect_name: draft.collectName,
    consent_note: draft.consentNote || null,
    is_paused: draft.isPaused,
  };
}

/**
 * Confirm a chosen graphic is an image asset on THIS release.
 *
 * Without this an owner could point their public page at any asset id they
 * could guess, including one on another team's release — the public page
 * resolves the graphic with the service-role client, so RLS would not catch
 * it. Empty is valid and means "fall back to cover art".
 */
export async function ensureGraphicAsset(
  adminClient: NonNullable<ReturnType<typeof createAdminClient>>,
  releaseId: string,
  assetId: string
): Promise<{ error: NextResponse } | { ok: true }> {
  if (!assetId) return { ok: true };

  const { data: asset, error } = await adminClient
    .from('assets')
    .select('id,release_id,category')
    .eq('id', assetId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: error.message || 'Could not load the chosen image.' },
        { status: 500 }
      ),
    };
  }

  if (!asset || String(asset.release_id || '') !== releaseId) {
    return {
      error: NextResponse.json({ error: 'That image is not on this rollout.' }, { status: 400 }),
    };
  }

  // Image categories only. Audio, documents and contracts are private working
  // files and must never be reachable from a public link — the same rule the
  // EPK page enforces on its asset read. Typed against AssetCategory so
  // renaming a category breaks the build here rather than silently widening
  // what a public page can show.
  const category = String(asset.category || '');
  if (!(PUBLIC_IMAGE_ASSET_CATEGORIES as readonly string[]).includes(category)) {
    return {
      error: NextResponse.json(
        { error: 'Pick an image. Only artwork and promo images can go on a public page.' },
        { status: 400 }
      ),
    };
  }

  return { ok: true };
}
