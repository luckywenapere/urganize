// Shared plumbing for the OAuth 2.1 route group behind per-user MCP access
// (2026-08-25).
//
// Two of these routes (`register`, `token`) are UNAUTHENTICATED by necessity —
// a client registering itself has no credential yet, and a client exchanging a
// code presents the code rather than a session. So this module deliberately
// does NOT import anything from app/api/_shared/auth: there is no user to
// resolve, and pulling the paywall chain in behind these routes would be both
// meaningless and a way for a billing read to break an authorization flow.
// `authorize/grant` is the one that needs a real session, and it reaches for
// the auth helper itself.
//
// Table access is service-role throughout, which is the access control rather
// than a convenience: all three mcp_oauth_* tables have RLS enabled with no
// policies at all, so nothing here is readable from a browser.

import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isMcpConnectEnabled } from '@/lib/mcp/config';
import { oauthError, oauthErrorStatus, type OauthErrorCode } from '@/lib/mcp/oauth';

export const MCP_OAUTH_CLIENTS_TABLE = 'mcp_oauth_clients';
export const MCP_OAUTH_CODES_TABLE = 'mcp_oauth_codes';
export const MCP_OAUTH_TOKENS_TABLE = 'mcp_oauth_tokens';

/**
 * The flag-off answer, matching app/api/mcp/route.ts's `notFound` byte for
 * byte. 404 rather than 403 so a disabled feature is indistinguishable from a
 * route that was never deployed — the tailor-plan/EPK precedent.
 */
export const oauthNotFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

/** `null` when the feature is on; a 404 response to return when it is off. */
export function requireMcpConnectEnabled(): NextResponse | null {
  return isMcpConnectEnabled() ? null : oauthNotFound();
}

/**
 * An RFC 6749 §5.2 error response.
 *
 * `Cache-Control: no-store` because RFC 6749 §5.1 requires it on token
 * responses and there is no version of an authorization error worth a cache
 * hit. Note none of these can be a 402: oauthErrorStatus never returns one, and
 * lib/access-redirect.ts would bounce the browser to /locked if it did.
 */
export function oauthErrorResponse(error: OauthErrorCode, description: string): NextResponse {
  return NextResponse.json(oauthError(error, description), {
    status: oauthErrorStatus(error),
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Service-role client, or null when the environment is incomplete. */
export function createOauthAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export type OauthClientRow = {
  client_id: string;
  client_name: string;
  redirect_uris: string[] | null;
};

/**
 * Resolve a registered client. Returns null for an unknown id OR an unreadable
 * table — the caller answers `invalid_client` either way, because telling a
 * caller apart from an outage is not information they can act on.
 */
export async function loadOauthClient(
  adminClient: SupabaseClient,
  clientId: string
): Promise<OauthClientRow | null> {
  if (!clientId) return null;
  try {
    const { data, error } = await adminClient
      .from(MCP_OAUTH_CLIENTS_TABLE)
      .select('client_id,client_name,redirect_uris')
      .eq('client_id', clientId)
      .maybeSingle();
    if (error || !data) return null;
    return data as OauthClientRow;
  } catch {
    return null;
  }
}

/**
 * Parse a token-endpoint body.
 *
 * RFC 6749 §4.1.3 specifies `application/x-www-form-urlencoded`, and that is
 * what every real client sends — but some send JSON, and refusing them over a
 * content type when the parameters are unambiguous would be pedantry that
 * costs a user their connection. Accept both.
 */
export async function readOauthFormBody(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const json = (await request.json()) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(json || {})) {
        if (typeof value === 'string') out[key] = value;
      }
      return out;
    }
    const form = await request.formData();
    const out: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}
