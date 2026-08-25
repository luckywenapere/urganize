// RFC 8414 authorization-server metadata (2026-08-25).
//
// Served from /.well-known/oauth-authorization-server via a next.config.js
// rewrite; see the sibling protected-resource route for why.
//
// Urganize is its own authorization server here, which is worth stating plainly
// because it is the surprising part of this feature: Supabase Auth signs the
// USER in, and this endpoint then issues a separate, narrower credential to a
// third-party client on that user's behalf. The two are not the same token and
// must never be interchangeable — an MCP access token cannot be used against
// PostgREST, and a Supabase JWT is not accepted at /api/oauth/token.

import { NextResponse } from 'next/server';
import { buildAuthorizationServerMetadata } from '@/lib/mcp/oauth';
import { resolveAppBaseUrl } from '@/lib/tasks-server';
import { requireMcpConnectEnabled } from '@/app/api/oauth/_shared';

export async function GET() {
  const gate = requireMcpConnectEnabled();
  if (gate) return gate;

  return NextResponse.json(buildAuthorizationServerMetadata(resolveAppBaseUrl()), {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function OPTIONS() {
  const gate = requireMcpConnectEnabled();
  if (gate) return gate;
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
