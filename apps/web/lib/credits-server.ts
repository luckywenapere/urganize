/**
 * Server-side resolution for the public credit-submission form (URG-108).
 *
 * The share token (release_credit_links row) is the only access control:
 * this runs with the service-role client and an unresolvable token is a
 * 404 — the same contract as lib/epk-server.ts. Only enough release context
 * to give a collaborator confidence they're on the right form (title,
 * artist, release date) is returned here; nothing else about the release or
 * its other submissions is ever exposed to the public form.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const RELEASE_CREDIT_LINKS_TABLE = 'release_credit_links';

export const isMetadataFeatureEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';

export type PublicCreditForm = {
  releaseId: string;
  releaseTitle: string;
  artistName: string;
  releaseDate: string | null;
};

// Shared by the public page (read) and the public submit route (write) —
// both run with no user session, so both need the service-role client.
export function createCreditsServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Tokens are 24-char base64url, same shape as EPK share tokens; a cheap
// shape check keeps junk paths from reaching the database.
export const CREDIT_TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Resolve a share token to the release context the public form needs.
 * Returns null for anything that should render as 404: flag off, unknown
 * token, or a broken environment — the public page never distinguishes
 * "revoked" from "never existed".
 */
export async function loadPublicCreditForm(token: string): Promise<PublicCreditForm | null> {
  if (!isMetadataFeatureEnabled()) return null;
  const normalizedToken = token.trim();
  if (!CREDIT_TOKEN_SHAPE.test(normalizedToken)) return null;

  const client = createCreditsServiceClient();
  if (!client) return null;

  try {
    const { data: link, error: linkError } = await client
      .from(RELEASE_CREDIT_LINKS_TABLE)
      .select('release_id')
      .eq('share_token', normalizedToken)
      .maybeSingle();

    if (linkError || !link?.release_id) return null;

    const { data: release, error: releaseError } = await client
      .from('releases')
      .select('id,title,artist_name,release_date')
      .eq('id', String(link.release_id))
      .maybeSingle();

    if (releaseError || !release) return null;

    return {
      releaseId: String(release.id),
      releaseTitle: String(release.title || ''),
      artistName: String(release.artist_name || ''),
      releaseDate: release.release_date ? String(release.release_date) : null,
    };
  } catch {
    // A public page must degrade to 404, never 500, on infrastructure blips.
    return null;
  }
}
