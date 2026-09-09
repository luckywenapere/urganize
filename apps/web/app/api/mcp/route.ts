// MCP endpoint — exposes Chappi's tool surface to an external MCP client over
// stateless Streamable HTTP.
//
// TWO WAYS IN (see lib/mcp/config.ts):
//   1. MCP_ACCESS_KEY, the founder key, bound to one account by env.
//   2. A per-user OAuth access token, so any customer can connect their own
//      LLM client and act as themselves (2026-08-25).
//
// The endpoint answers whenever EITHER is available, so it is dark only when
// the founder key is unset AND per-user access is switched off. Both resolve
// through resolveMcpActor below, which is also what /api/_shared/auth.ts's
// internal-actor branch uses for the REST-proxied tools — so a token is
// recognised identically on the way in and on the way back round.
//
// Stateless on purpose: no Mcp-Session-Id is ever emitted (issuing one would
// commit us to session semantics), GET is 405 (we open no server-initiated
// streams), and every response is plain JSON. All protocol logic lives in
// lib/mcp/protocol.ts; all tool logic stays in lib/chappi.
//
// A 401 carries WWW-Authenticate with a resource_metadata pointer, and that
// header is what makes per-user access work at all: it is how a client learns
// there is an authorization server to talk to. Without it, claude.ai reports
// the server as unreachable and gives up rather than starting the OAuth flow.
//
// Origin/DNS-rebinding checks the spec recommends for local unauthenticated
// servers are unnecessary here: every request must carry a bearer credential.

import { NextRequest, NextResponse } from 'next/server';
import { CURRENT_VERSION } from '@urganize/changelog';
import { createAdminClient } from '@/app/api/_shared/auth';
import { requireActiveAccount } from '@/app/api/_shared/paywall';
import { logBillingEvent } from '@/lib/billing-events-server';
import { executeToolCall, resolveChappiContext } from '@/lib/chappi/dispatch';
import { listVisibleReleases } from '@/lib/chappi/release-scope';
import {
  buildPortableWorkspaceContext,
  buildReleaseContext,
} from '@/lib/chappi/portable-context';
import { getMcpConfig, isMcpConnectEnabled, verifyMcpAccessKey } from '@/lib/mcp/config';
import { extractBearerToken } from '@/lib/mcp/oauth';
import { resolveMcpToken } from '@/lib/mcp/tokens-server';
import {
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
  WORKSPACE_CONTEXT_URI,
  buildInitializeResult,
  buildReleaseContextUri,
  buildResourceDescriptor,
  jsonRpcError,
  jsonRpcResult,
  parseJsonRpcMessage,
  parseReleaseContextUri,
  resourceTextResult,
  toolResultToMcp,
} from '@/lib/mcp/protocol';
import {
  getMcpToolDescriptors,
  isMcpToolName,
  resolveMcpToolAccessMethod,
} from '@/lib/mcp/tools';
import { resolveAppBaseUrl } from '@/lib/tasks-server';
import type { SupabaseClient } from '@supabase/supabase-js';

// A tools/call can proxy a ~20s AI status generation or instantiate a 64-task
// release template, so the default function ceiling is too tight. Matches the
// chappi and generate-status routes.
export const maxDuration = 60;

const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });

const methodNotAllowed = () =>
  new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });

/** Is there any way at all to authenticate against this endpoint right now? */
const isEndpointAvailable = (): boolean => Boolean(getMcpConfig()) || isMcpConnectEnabled();

/**
 * 401 with the RFC 9728 discovery pointer.
 *
 * The `resource_metadata` parameter is the load-bearing part: a client that
 * gets this reads the document, finds the authorization server, and starts the
 * OAuth flow. Emitted even when only the founder key is configured — it costs
 * nothing and a client that follows it will simply find a 404 there.
 */
function unauthorized(): NextResponse {
  const baseUrl = resolveAppBaseUrl();
  return NextResponse.json(
    { error: 'Unauthorized' },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
      },
    }
  );
}

type McpActor = {
  userId: string;
  /** The credential to hand the REST-proxied tools, so they resolve as us. */
  authToken: string;
};

/**
 * Which account is calling.
 *
 * The founder key is checked first: a constant-time comparison against a value
 * already in memory, so the per-user path never pays for it and the founder
 * path never touches the database. Order matters for cost, not for security —
 * the two credential spaces cannot collide, since a random 32-byte token would
 * have to equal MCP_ACCESS_KEY to be mistaken for it.
 */
async function resolveMcpActor(
  adminClient: SupabaseClient,
  token: string
): Promise<McpActor | null> {
  const config = getMcpConfig();
  if (config && verifyMcpAccessKey(token)) {
    return { userId: config.userId, authToken: config.accessKey };
  }
  if (!isMcpConnectEnabled()) return null;
  const actor = await resolveMcpToken(adminClient, token);
  return actor ? { userId: actor.userId, authToken: token } : null;
}

export async function POST(request: NextRequest) {
  // 1. Dark unless there is some way to authenticate.
  if (!isEndpointAvailable()) return notFound();

  // 2. A bearer credential of one kind or the other.
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return unauthorized();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const adminClient = supabaseUrl ? createAdminClient(supabaseUrl) : null;
  if (!adminClient) {
    console.error('[mcp] Supabase service-role env is not configured.');
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const actor = await resolveMcpActor(adminClient, token);
  if (!actor) return unauthorized();

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

  // ── Resources ────────────────────────────────────────────────────────────
  //
  // The same context the two context tools return, exposed as the primitive
  // that actually means "attach this": a client browses resources and picks
  // one, where a tool is something a model decides to call. Both exist because
  // tool support is universal and resource support is not.
  //
  // Reads only, so no access gate beyond the bearer — and deliberately the same
  // read path as everything else (listVisibleReleases), which is what keeps an
  // artist-scoped member from listing a manager's whole roster here.
  if (method === 'resources/list' || method === 'resources/read') {
    try {
      const { data: resourceUser, error: resourceError } =
        await adminClient.auth.admin.getUserById(actor.userId);
      if (resourceError || !resourceUser.user?.id) {
        console.error('[mcp] actor did not resolve to a user:', resourceError?.message);
        return NextResponse.json({ error: 'MCP user is not configured correctly' }, { status: 500 });
      }

      const ctx = await resolveChappiContext({
        user: resourceUser.user,
        adminClient,
        origin: new URL(request.url).origin,
        authToken: actor.authToken,
      });

      if (method === 'resources/list') {
        const releases = await listVisibleReleases(ctx);
        return NextResponse.json(
          jsonRpcResult(id, {
            resources: [
              buildResourceDescriptor({
                uri: WORKSPACE_CONTEXT_URI,
                name: 'Everything about this team',
                description:
                  'How the team works, every current rollout with its progress, what is overdue, and who is carrying what.',
              }),
              ...releases.map((release) =>
                buildResourceDescriptor({
                  uri: buildReleaseContextUri(release.id),
                  name: release.title,
                  description: `One rollout in full: dates, progress, what is blocked and what is next.${
                    release.releaseDate ? ` Out ${release.releaseDate}.` : ''
                  }`,
                })
              ),
            ],
          })
        );
      }

      const uri = typeof params.uri === 'string' ? params.uri.trim() : '';
      if (uri === WORKSPACE_CONTEXT_URI) {
        const context = await buildPortableWorkspaceContext(ctx);
        return NextResponse.json(jsonRpcResult(id, resourceTextResult(uri, context.text)));
      }

      const releaseId = parseReleaseContextUri(uri);
      if (releaseId) {
        const context = await buildReleaseContext(ctx, releaseId);
        // A release the caller cannot see is indistinguishable from one that
        // does not exist, which is the same line the rest of the app draws.
        if (context) {
          return NextResponse.json(jsonRpcResult(id, resourceTextResult(uri, context)));
        }
      }

      return NextResponse.json(
        jsonRpcError(id, JSON_RPC_INVALID_PARAMS, `Unknown resource: ${uri || '(none)'}`)
      );
    } catch (resourceFailure) {
      console.error(`[mcp] ${method} failed:`, resourceFailure);
      return NextResponse.json(
        jsonRpcError(id, JSON_RPC_INVALID_PARAMS, 'That context could not be read.')
      );
    }
  }

  if (method === 'tools/call') {
    const name = typeof params.name === 'string' ? params.name : '';
    if (!isMcpToolName(name)) {
      return NextResponse.json(
        jsonRpcError(id, JSON_RPC_INVALID_PARAMS, `Unknown tool: ${name || '(none)'}`)
      );
    }

    // ── The access gate, PER TOOL rather than per HTTP method ──────────────
    //
    // requireActiveAccount decides read-only mode from request.method, and MCP
    // is all-POST — so passing the real method would refuse a payment-lapsed
    // team its MCP READS as well as its writes. That team can still read
    // everything in the app, and this is how they would read it from their own
    // LLM. So the tool's own kind picks the synthetic method: a read is a GET.
    //
    // The refusal comes back as a successful JSON-RPC result carrying isError,
    // not as an HTTP status, so the model can read the reason and tell the
    // user what happened instead of reporting a dead server.
    //
    // The user is resolved BEFORE the gate so the email reaches it: the paywall
    // allowlist matches on email, and passing undefined would silently deny an
    // allowlisted account the bypass it has everywhere else.
    const { data: actorUser, error: actorError } =
      await adminClient.auth.admin.getUserById(actor.userId);
    if (actorError || !actorUser.user?.id) {
      console.error('[mcp] actor did not resolve to a user:', actorError?.message);
      return NextResponse.json({ error: 'MCP user is not configured correctly' }, { status: 500 });
    }

    const syntheticMethod = resolveMcpToolAccessMethod(name);
    const block = await requireActiveAccount(
      actor.userId,
      actorUser.user.email,
      syntheticMethod
    );
    if (block) {
      const body = (await block.json().catch(() => ({}))) as { error?: string };
      return NextResponse.json(
        jsonRpcResult(id, {
          content: [
            {
              type: 'text',
              text: body.error || 'This team does not have access right now.',
            },
          ],
          isError: true,
        })
      );
    }

    try {
      const ctx = await resolveChappiContext({
        user: actorUser.user,
        adminClient,
        origin: new URL(request.url).origin,
        // The caller's own credential, so the REST-proxied tools resolve back
        // to the same account through the internal-actor branch. For the
        // founder key this is that key; for a customer it is their token.
        authToken: actor.authToken,
      });
      const result = await executeToolCall(ctx, name, params.arguments);

      // Visibility only, never a ceiling. See the comment on 'mcp_tool_call'
      // in lib/billing-events.ts for why this is not metered.
      void logBillingEvent(adminClient, {
        workspaceId: ctx.workspaceIds[0] || null,
        ownerUserId: null,
        actorUserId: actor.userId,
        type: 'mcp_tool_call',
        metadata: { tool: name, ok: result.ok },
      });

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
  return isEndpointAvailable() ? methodNotAllowed() : notFound();
}

export async function DELETE() {
  return isEndpointAvailable() ? methodNotAllowed() : notFound();
}
