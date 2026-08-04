// MCP endpoint — exposes Chappi's tool surface to an external MCP client
// (Claude Code / Claude Desktop) over stateless Streamable HTTP.
//
// Founder-only by construction: a caller must present MCP_ACCESS_KEY, and that
// key is bound to exactly one account (MCP_USER_ID). Unconfigured → 404, so the
// endpoint is dark until both env vars are set (the same pattern the flag-gated
// routes use — see app/api/urgans/route.ts).
//
// Stateless on purpose: no Mcp-Session-Id is ever emitted (issuing one would
// commit us to session semantics), GET is 405 (we open no server-initiated
// streams), and every response is plain JSON. All protocol logic lives in
// lib/mcp/protocol.ts; all tool logic stays in lib/chappi.
//
// Origin/DNS-rebinding checks the spec recommends for local unauthenticated
// servers are unnecessary here: every request must carry the bearer key.

import { NextRequest, NextResponse } from 'next/server';
import { CURRENT_VERSION } from '@urganize/changelog';
import { createAdminClient } from '@/app/api/_shared/auth';
import { executeToolCall, resolveChappiContext } from '@/lib/chappi/dispatch';
import { getMcpConfig, verifyMcpAccessKey } from '@/lib/mcp/config';
import {
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
  buildInitializeResult,
  jsonRpcError,
  jsonRpcResult,
  parseJsonRpcMessage,
  toolResultToMcp,
} from '@/lib/mcp/protocol';
import { getMcpToolDescriptors, isMcpToolName } from '@/lib/mcp/tools';

// A tools/call can proxy a ~20s AI status generation or instantiate a 64-task
// release template, so the default function ceiling is too tight. Matches the
// chappi and generate-status routes.
export const maxDuration = 60;

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

const methodNotAllowed = () =>
  new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });

export async function POST(request: NextRequest) {
  // 1. Dark unless fully configured.
  const config = getMcpConfig();
  if (!config) return notFound();

  // 2. Bearer key, compared in constant time.
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!verifyMcpAccessKey(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const message = parseJsonRpcMessage(await request.json().catch(() => null));

  // A notification expects no response body — just an ack. This covers
  // notifications/initialized, which the client sends after initialize.
  if (message.kind === 'notification') return new NextResponse(null, { status: 202 });
  if (message.kind === 'error') return NextResponse.json(message.payload);

  const { id, method, params } = message.request;

  if (method === 'initialize') {
    return NextResponse.json(
      jsonRpcResult(
        id,
        buildInitializeResult({
          requestedVersion: params.protocolVersion,
          serverVersion: CURRENT_VERSION,
        })
      )
    );
  }

  if (method === 'ping') {
    return NextResponse.json(jsonRpcResult(id, {}));
  }

  if (method === 'tools/list') {
    return NextResponse.json(jsonRpcResult(id, { tools: getMcpToolDescriptors() }));
  }

  if (method === 'tools/call') {
    const name = typeof params.name === 'string' ? params.name : '';
    if (!isMcpToolName(name)) {
      return NextResponse.json(
        jsonRpcError(id, JSON_RPC_INVALID_PARAMS, `Unknown tool: ${name || '(none)'}`)
      );
    }

    // Resolve the bound account. This is the only place the MCP actor is
    // established for reads; the four REST-proxied mutating tools re-establish
    // it themselves via the *OrInternal auth helpers, keyed off the same token.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const adminClient = supabaseUrl ? createAdminClient(supabaseUrl) : null;
    if (!adminClient) {
      console.error('[mcp] Supabase service-role env is not configured.');
      return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
    }

    const { data, error } = await adminClient.auth.admin.getUserById(config.userId);
    if (error || !data.user?.id) {
      console.error('[mcp] MCP_USER_ID did not resolve to a user:', error?.message);
      return NextResponse.json({ error: 'MCP user is not configured correctly' }, { status: 500 });
    }

    try {
      const ctx = await resolveChappiContext({
        user: data.user,
        adminClient,
        origin: new URL(request.url).origin,
        // The key IS the credential the proxied REST calls present back to us.
        authToken: config.accessKey,
      });
      const result = await executeToolCall(ctx, name, params.arguments);
      // A failed tool is a successful call carrying isError — JSON-RPC errors
      // are reserved for protocol problems, so the model can see and reason
      // about the failure instead of the transport swallowing it.
      return NextResponse.json(jsonRpcResult(id, toolResultToMcp(result)));
    } catch (toolError) {
      // executeToolCall already absorbs tool throws; this catches context
      // resolution failing (workspace lookup, DB down).
      console.error(`[mcp] tools/call "${name}" failed before execution:`, toolError);
      return NextResponse.json(
        jsonRpcResult(id, {
          content: [{ type: 'text', text: 'That action could not be started. Nothing was changed.' }],
          isError: true,
        })
      );
    }
  }

  return NextResponse.json(jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, `Unknown method: ${method}`));
}

// No server-initiated streams and no sessions to terminate.
export async function GET() {
  return getMcpConfig() ? methodNotAllowed() : notFound();
}

export async function DELETE() {
  return getMcpConfig() ? methodNotAllowed() : notFound();
}
