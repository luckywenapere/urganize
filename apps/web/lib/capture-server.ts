/**
 * Server-side resolution for the public fan-capture page (2026-08-14).
 *
 * The share token (release_capture_pages row) is the only access control: this
 * runs with the service-role client and an unresolvable token is a 404 — the
 * same contract as lib/epk-server.ts and lib/credits-server.ts. Only enough
 * release context to make the page recognisable (title, artist, artwork) is
 * returned; nothing else about the release, and nothing at all about the
 * emails already collected, is ever exposed publicly.
 *
 * Shared by the public page (read) and the public submit route (write), which
 * is why the client factory and the token shape live here rather than in the
 * page.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ASSET_SIGNED_URL_TTL_SECONDS,
  RELEASE_ASSETS_BUCKET,
  generateSignedUrl,
} from '@/lib/asset-helpers';
import { loadCoverArtUrlMap } from '@/lib/cover-art';
import { DEFAULT_BUTTON_LABEL, DEFAULT_CONSENT_NOTE, isUsableDestination } from '@/lib/capture-playbook';

const RELEASE_CAPTURE_PAGES_TABLE = 'release_capture_pages';

export const isCaptureFeatureEnabled = (): boolean =>
  (process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true' || process.env.NEXT_PUBLIC_FEATURE_ALTLINK !== 'false');

// Tokens are 24-char base64url, same shape as EPK and credit share tokens; a
// cheap shape check keeps junk paths from reaching the database.
export const CAPTURE_TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

export type PublicCapturePage = {
  releaseId: string;
  capturePageId: string;
  releaseTitle: string;
  artistName: string;
  headline: string;
  incentive: string;
  destinationLabel: string;
  buttonLabel: string;
  consentNote: string;
  collectName: boolean;
  graphicUrl: string | null;
  /** The owner took the page out of circulation. Renders a closed state, not
   * a 404: a fan who taps a shared link deserves to be told the list is shut
   * rather than shown a dead end. */
  isPaused: boolean;
  /**
   * Whether this page will accept an email.
   *
   * False when paused OR when there is no usable destination — the playbook's
   * L1 rule ("the fan must be paid for the email") enforced at the only place
   * it can actually be enforced. A page with nothing to give must not collect;
   * taking an address and returning nothing is the fastest way to burn the
   * trust the whole surface depends on.
   */
  isCollecting: boolean;
};

export function createCaptureServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Resolve the graphic the page shows.
 *
 * Precedence: the explicitly chosen asset, then the release's cover art.
 *
 * DELIBERATELY NOT the workspace-logo leg that /api/releases and the EPK page
 * both end with. Those surfaces want *something* in an artwork slot; this one
 * wants the image to make a fan recognise the artist in about a second, and
 * the playbook's G1 rule says a logo does the opposite of that. Falling back
 * to no image at all is honest and makes the checklist's "add cover art"
 * suggestion the thing that fixes it.
 */
async function resolveGraphicUrl(
  client: SupabaseClient,
  releaseId: string,
  graphicAssetId: string,
  artworkAssetId: string | null
): Promise<string | null> {
  if (graphicAssetId) {
    const { data: asset } = await client
      .from('assets')
      .select('storage_bucket,storage_path,release_id')
      .eq('id', graphicAssetId)
      .maybeSingle();

    const row = asset as { storage_bucket?: string; storage_path?: string; release_id?: string } | null;
    // Re-check the asset still belongs to this release. The owner route
    // validates on save, but an asset can be moved or the row can be stale, and
    // this is a public surface — it re-earns the check rather than assuming.
    if (row?.storage_path && String(row.release_id || '') === releaseId) {
      const signed = await generateSignedUrl(
        client,
        row.storage_bucket || RELEASE_ASSETS_BUCKET,
        row.storage_path,
        ASSET_SIGNED_URL_TTL_SECONDS
      );
      if (signed) return signed;
    }
  }

  const coverMap = await loadCoverArtUrlMap(client, [
    { id: releaseId, artwork_asset_id: artworkAssetId },
  ]);
  return coverMap.get(releaseId) || null;
}

/**
 * Resolve a share token to the public page.
 *
 * Returns null for anything that should render as 404: flag off, unknown
 * token, or a broken environment — the public page never distinguishes
 * "rotated" from "never existed".
 */
export async function loadPublicCapturePage(token: string): Promise<PublicCapturePage | null> {
  if (!isCaptureFeatureEnabled()) return null;
  const normalizedToken = token.trim();
  if (!CAPTURE_TOKEN_SHAPE.test(normalizedToken)) return null;

  const client = createCaptureServiceClient();
  if (!client) return null;

  try {
    const { data: page, error: pageError } = await client
      .from(RELEASE_CAPTURE_PAGES_TABLE)
      .select(
        'id,release_id,headline,incentive,destination_url,destination_label,button_label,graphic_asset_id,collect_name,consent_note,is_paused'
      )
      .eq('share_token', normalizedToken)
      .maybeSingle();

    if (pageError || !page?.release_id) return null;

    const releaseId = String(page.release_id);

    const { data: release, error: releaseError } = await client
      .from('releases')
      .select('id,title,artist_name,artwork_asset_id')
      .eq('id', releaseId)
      .maybeSingle();

    if (releaseError || !release) return null;

    const graphicUrl = await resolveGraphicUrl(
      client,
      releaseId,
      String(page.graphic_asset_id || ''),
      release.artwork_asset_id ? String(release.artwork_asset_id) : null
    );

    const isPaused = page.is_paused === true;
    const hasDestination = isUsableDestination(
      page.destination_url ? String(page.destination_url) : ''
    );

    return {
      releaseId,
      capturePageId: String(page.id || ''),
      releaseTitle: String(release.title || ''),
      artistName: String(release.artist_name || ''),
      headline: String(page.headline || ''),
      incentive: String(page.incentive || ''),
      destinationLabel: String(page.destination_label || ''),
      // House copy rather than a bare button, so a page can never ship with an
      // unlabelled control (playbook C4).
      buttonLabel: String(page.button_label || '') || DEFAULT_BUTTON_LABEL,
      // Likewise for the consent line (playbook T1): a bare field with no
      // explanation is never an acceptable render.
      consentNote: String(page.consent_note || '') || DEFAULT_CONSENT_NOTE,
      collectName: page.collect_name === true,
      graphicUrl,
      isPaused,
      isCollecting: !isPaused && hasDestination,
    };
  } catch {
    // A public page must degrade to 404, never 500, on infrastructure blips.
    return null;
  }
}
