// RFC 9728 protected-resource metadata for the MCP endpoint (2026-08-25).
//
// Reached at /.well-known/oauth-protected-resource via a rewrite in
// next.config.js — Next's router ignores dot-prefixed path segments, so this
// cannot live at app/.well-known/... The rewrite also maps the path-suffixed
// form (/.well-known/oauth-protected-resource/api/mcp) here, because clients
// try that first for a resource that lives at a path and only then fall back
// to the root document.
//
// THIS DOCUMENT IS WHAT MAKES DISCOVERY WORK. A client that gets a 401 from
// /api/mcp reads the WWW-Authenticate header, follows it here, learns which
// authorization server to talk to, and starts the OAuth dance. Without it the
// client has nowhere to go and simply reports that the server is unreachable.

import { NextResponse } from 'next/server';
import { buildProtectedResourceMetadata } from '@/lib/mcp/oauth';
import { resolveAppBaseUrl } from '@/lib/tasks-server';
import { requireMcpConnectEnabled } from '@/app/api/oauth/_shared';

export async function GET() {
  const gate = requireMcpConnectEnabled();
  if (gate) return gate;

  return NextResponse.json(buildProtectedResourceMetadata(resolveAppBaseUrl()), {
    headers: {
      // Public, non-secret, and changes only on deploy. A short cache spares
      // us a round trip per client connect without making a flag flip slow to
      // take effect.
      'Cache-Control': 'public, max-age=300',
      // Clients are third-party origins by definition.
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** Preflight, since clients fetch this cross-origin from a browser. */
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
