// Model Context Protocol — the JSON-RPC layer, hand-rolled and PURE (no I/O,
// no imports beyond types). Kept dependency-free on purpose: the surface an MCP
// client actually needs from a stateless server is five methods (initialize,
// notifications/initialized, ping, tools/list, tools/call), which is far less
// code than @modelcontextprotocol/sdk plus its session machinery would add.
// Same call the admin hub's Growth chart made against chart.js.
//
// Statelessness is deliberate and load-bearing: we never emit an
// Mcp-Session-Id (emitting one obligates us to session semantics) and we
// answer GET with 405, the spec's sanctioned "this server opens no
// server-initiated streams." Responses are plain JSON — SSE is optional for
// servers, and no tool here streams.

export const MCP_SERVER_NAME = 'urganize';

/**
 * Protocol revisions we accept, newest first. Negotiation echoes the client's
 * requested version when we know it, else answers with our newest and lets the
 * client decide whether to proceed (per the initialize contract).
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26'] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

// JSON-RPC 2.0 error codes. Reserved range, standard meanings.
export const JSON_RPC_PARSE_ERROR = -32700;
export const JSON_RPC_INVALID_REQUEST = -32600;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;

/** A JSON-RPC id. Notifications have none. */
export type JsonRpcId = string | number;

export type JsonRpcRequest = {
  method: string;
  params: Record<string, unknown>;
  /** Absent on notifications — the caller expects no response body. */
  id?: JsonRpcId;
};

export type JsonRpcErrorPayload = {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  error: { code: number; message: string };
};

export type JsonRpcResultPayload = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: Record<string, unknown>;
};

export type ParsedMessage =
  | { kind: 'request'; request: JsonRpcRequest & { id: JsonRpcId } }
  | { kind: 'notification'; request: JsonRpcRequest }
  | { kind: 'error'; payload: JsonRpcErrorPayload };

// ── builders ───────────────────────────────────────────────────────────────

export function jsonRpcResult(id: JsonRpcId, result: Record<string, unknown>): JsonRpcResultPayload {
  return { jsonrpc: '2.0', id, result };
}

export function jsonRpcError(
  id: JsonRpcId | null,
  code: number,
  message: string
): JsonRpcErrorPayload {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// ── parsing ────────────────────────────────────────────────────────────────

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isValidId = (value: unknown): value is JsonRpcId =>
  typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

/**
 * Validate one incoming JSON-RPC message. `body` is whatever JSON.parse
 * produced (pass null for a parse failure, which maps to -32700).
 *
 * Batch arrays are rejected with -32600: batching was removed from the protocol
 * in 2025-06-18, and supporting it for older revisions isn't worth the branch.
 */
export function parseJsonRpcMessage(body: unknown): ParsedMessage {
  if (body === null || body === undefined) {
    return { kind: 'error', payload: jsonRpcError(null, JSON_RPC_PARSE_ERROR, 'Invalid JSON.') };
  }

  if (Array.isArray(body)) {
    return {
      kind: 'error',
      payload: jsonRpcError(null, JSON_RPC_INVALID_REQUEST, 'Batched requests are not supported.'),
    };
  }

  if (!isPlainObject(body)) {
    return {
      kind: 'error',
      payload: jsonRpcError(null, JSON_RPC_INVALID_REQUEST, 'Request must be a JSON object.'),
    };
  }

  if (body.jsonrpc !== '2.0') {
    return {
      kind: 'error',
      payload: jsonRpcError(
        isValidId(body.id) ? body.id : null,
        JSON_RPC_INVALID_REQUEST,
        'Expected jsonrpc: "2.0".'
      ),
    };
  }

  if (typeof body.method !== 'string' || !body.method) {
    return {
      kind: 'error',
      payload: jsonRpcError(
        isValidId(body.id) ? body.id : null,
        JSON_RPC_INVALID_REQUEST,
        'Missing method.'
      ),
    };
  }

  const params = isPlainObject(body.params) ? body.params : {};

  // No id (or a malformed one on a notifications/* method) means notification:
  // the client wants no response. An id that's present but malformed on a real
  // request is an invalid request.
  if (body.id === undefined || body.id === null) {
    return { kind: 'notification', request: { method: body.method, params } };
  }
  if (!isValidId(body.id)) {
    return {
      kind: 'error',
      payload: jsonRpcError(null, JSON_RPC_INVALID_REQUEST, 'Invalid id.'),
    };
  }

  return { kind: 'request', request: { method: body.method, params, id: body.id } };
}

// ── method results ─────────────────────────────────────────────────────────

/** Pick the protocol version to answer `initialize` with. */
export function negotiateProtocolVersion(requested: unknown): string {
  if (typeof requested === 'string') {
    const match = SUPPORTED_PROTOCOL_VERSIONS.find((version) => version === requested);
    if (match) return match;
  }
  return LATEST_PROTOCOL_VERSION;
}

/**
 * `initialize` result. Declares tools and resources — no prompts, logging, or
 * completions are served.
 *
 * Resources were added 2026-08-25 alongside per-user access, because they are
 * the primitive that actually matches "take my context to another LLM": a
 * resource is something a client attaches, where a tool is something a model
 * decides to call. The same context is exposed BOTH ways on purpose — tool
 * support is universal across clients, resource support is not, and a manager
 * should not have to know which kind of client they picked.
 *
 * Neither capability declares `listChanged`: the tool list is static per deploy
 * and the resource list changes only when the user's own releases do, which
 * they will discover by listing again.
 */
export function buildInitializeResult(params: {
  requestedVersion: unknown;
  serverVersion: string;
}): Record<string, unknown> {
  return {
    protocolVersion: negotiateProtocolVersion(params.requestedVersion),
    capabilities: { tools: {}, resources: {} },
    serverInfo: { name: MCP_SERVER_NAME, version: params.serverVersion },
  };
}

// ── Resources ───────────────────────────────────────────────────────────────

/** The whole team's context — the same block get_workspace_context returns. */
export const WORKSPACE_CONTEXT_URI = 'urganize://workspace/context';

/** One release. `urganize://release/<id>/context`. */
export const RELEASE_CONTEXT_URI_PREFIX = 'urganize://release/';
const RELEASE_CONTEXT_URI_SUFFIX = '/context';

export function buildReleaseContextUri(releaseId: string): string {
  return `${RELEASE_CONTEXT_URI_PREFIX}${releaseId}${RELEASE_CONTEXT_URI_SUFFIX}`;
}

/**
 * Pull a release id back out of a resource URI, or null.
 *
 * Deliberately strict rather than a lenient split: a URI is attacker-supplied
 * text, and the id it yields is fed to a lookup. An empty or malformed id must
 * come back as null rather than as a query for everything.
 */
export function parseReleaseContextUri(uri: string): string | null {
  const value = String(uri || '').trim();
  if (!value.startsWith(RELEASE_CONTEXT_URI_PREFIX)) return null;
  if (!value.endsWith(RELEASE_CONTEXT_URI_SUFFIX)) return null;
  const id = value.slice(
    RELEASE_CONTEXT_URI_PREFIX.length,
    value.length - RELEASE_CONTEXT_URI_SUFFIX.length
  );
  // A release id is a uuid; anything with a slash in it is somebody probing.
  if (!id || id.includes('/')) return null;
  return id;
}

/** One entry in a `resources/list` result. */
export function buildResourceDescriptor(input: {
  uri: string;
  name: string;
  description: string;
}): Record<string, unknown> {
  return { ...input, mimeType: 'text/plain' };
}

/** A `resources/read` result, which the spec shapes as a `contents` array. */
export function resourceTextResult(uri: string, text: string): Record<string, unknown> {
  return { contents: [{ uri, mimeType: 'text/plain', text }] };
}

/**
 * Map a Chappi tool outcome to an MCP CallToolResult.
 *
 * A tool that fails is still a successful JSON-RPC call carrying
 * `isError: true` — JSON-RPC errors are reserved for protocol-level problems
 * (bad JSON, unknown method, unknown tool). That distinction is what lets the
 * model see and reason about a failed action instead of the transport eating it.
 *
 * `clientAction` is dropped: it addresses a React router and modals that don't
 * exist outside the app. Any id a caller needs (a new release's, say) is in
 * `data` regardless.
 */
export function toolResultToMcp(result: {
  ok: boolean;
  summary: string;
  data?: unknown;
}): Record<string, unknown> {
  const text =
    result.data === undefined
      ? result.summary
      : `${result.summary}\n${JSON.stringify(result.data, null, 2)}`;
  return {
    content: [{ type: 'text', text }],
    isError: !result.ok,
  };
}
