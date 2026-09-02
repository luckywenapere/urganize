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

/**
 * How a share token resolves publicly.
 *
 * 'closed' exists because the owner can now pause a link (release_credit_links
 * .closed_at) and the spec asks for a polite "this request is closed" message
 * rather than a dead end. Everything else still collapses to 'missing' — the
 * page must never distinguish a rotated-away token from one that never existed.
 */
export type PublicCreditFormLookup =
  | { kind: 'ok'; form: PublicCreditForm }
  | { kind: 'closed'; form: PublicCreditForm }
  | { kind: 'missing' };

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
 * Pure: what a link row (or its absence) means to the public page.
 *
 * Split out from the query so it can be unit-tested — this is the one place
 * "closed" and "gone" are told apart, and getting it backwards would either
 * leak the existence of a rotated token or leave a closed link looking broken.
 */
export function classifyCreditLinkRow(
  row: { release_id?: unknown; closed_at?: unknown } | null | undefined
): 'missing' | 'closed' | 'open' {
  if (!row?.release_id) return 'missing';
  return row.closed_at ? 'closed' : 'open';
}

/**
 * Resolve a share token to the release context the public form needs.
 *
 * Returns 'missing' for anything that should render as 404: flag off, unknown
 * token, a deleted release, or a broken environment — the public page never
 * distinguishes "revoked" from "never existed". A link the owner CLOSED is the
 * one exception, and it still carries the release context so the closed page
 * can name the release the person was trying to help with.
 */
export async function loadPublicCreditForm(token: string): Promise<PublicCreditFormLookup> {
  if (!isMetadataFeatureEnabled()) return { kind: 'missing' };
  const normalizedToken = token.trim();
  if (!CREDIT_TOKEN_SHAPE.test(normalizedToken)) return { kind: 'missing' };

  const client = createCreditsServiceClient();
  if (!client) return { kind: 'missing' };

  try {
    const { data: link, error: linkError } = await client
      .from(RELEASE_CREDIT_LINKS_TABLE)
      .select('release_id,closed_at')
      .eq('share_token', normalizedToken)
      .maybeSingle();

    if (linkError) return { kind: 'missing' };
    const state = classifyCreditLinkRow(link);
    if (state === 'missing') return { kind: 'missing' };

    const { data: release, error: releaseError } = await client
      .from('releases')
      .select('id,title,artist_name,release_date')
      .eq('id', String(link!.release_id))
      .maybeSingle();

    if (releaseError || !release) return { kind: 'missing' };

    const form: PublicCreditForm = {
      releaseId: String(release.id),
      releaseTitle: String(release.title || ''),
      artistName: String(release.artist_name || ''),
      releaseDate: release.release_date ? String(release.release_date) : null,
    };

    return state === 'closed' ? { kind: 'closed', form } : { kind: 'ok', form };
  } catch {
    // A public page must degrade to 404, never 500, on infrastructure blips.
    return { kind: 'missing' };
  }
}
