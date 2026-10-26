import { describe, expect, it } from 'vitest';
import {
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_PARSE_ERROR,
  LATEST_PROTOCOL_VERSION,
  buildInitializeResult,
  negotiateProtocolVersion,
  parseJsonRpcMessage,
  toolResultToMcp,
  WORKSPACE_CONTEXT_URI,
  buildReleaseContextUri,
  buildResourceDescriptor,
  parseReleaseContextUri,
  resourceTextResult,
} from './protocol';
import { getMcpToolDescriptors, isMcpToolName, resolveMcpToolAccessMethod } from './tools';

// The protocol layer is hand-rolled (no MCP SDK), so these tests are the
// contract: they pin the wire shapes an MCP client depends on. Everything here
// is pure — no env, no network, no Supabase.

describe('parseJsonRpcMessage', () => {
  it('parses a well-formed request', () => {
    const parsed = parseJsonRpcMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(parsed.kind).toBe('request');
    if (parsed.kind !== 'request') return;
    expect(parsed.request.id).toBe(1);
    expect(parsed.request.method).toBe('tools/list');
    expect(parsed.request.params).toEqual({});
  });

  it('treats a missing id as a notification', () => {
    const parsed = parseJsonRpcMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(parsed.kind).toBe('notification');
  });

  it('rejects batch arrays as invalid requests', () => {
    const parsed = parseJsonRpcMessage([{ jsonrpc: '2.0', id: 1, method: 'ping' }]);
    expect(parsed.kind).toBe('error');
    if (parsed.kind !== 'error') return;
    expect(parsed.payload.error.code).toBe(JSON_RPC_INVALID_REQUEST);
  });

  it('maps a null body (unparseable JSON) to a parse error', () => {
    const parsed = parseJsonRpcMessage(null);
    expect(parsed.kind).toBe('error');
    if (parsed.kind !== 'error') return;
    expect(parsed.payload.error.code).toBe(JSON_RPC_PARSE_ERROR);
    expect(parsed.payload.id).toBeNull();
  });

  it('rejects a malformed id', () => {
    const parsed = parseJsonRpcMessage({ jsonrpc: '2.0', id: { nope: true }, method: 'ping' });
    expect(parsed.kind).toBe('error');
    if (parsed.kind !== 'error') return;
    expect(parsed.payload.error.code).toBe(JSON_RPC_INVALID_REQUEST);
  });

  it('rejects a wrong jsonrpc version but keeps the id for the reply', () => {
    const parsed = parseJsonRpcMessage({ jsonrpc: '1.0', id: 7, method: 'ping' });
    expect(parsed.kind).toBe('error');
    if (parsed.kind !== 'error') return;
    expect(parsed.payload.id).toBe(7);
  });

  it('rejects a missing method', () => {
    const parsed = parseJsonRpcMessage({ jsonrpc: '2.0', id: 2 });
    expect(parsed.kind).toBe('error');
  });

  it('ignores non-object params instead of failing the request', () => {
    const parsed = parseJsonRpcMessage({ jsonrpc: '2.0', id: 3, method: 'ping', params: 'nope' });
    expect(parsed.kind).toBe('request');
    if (parsed.kind !== 'request') return;
    expect(parsed.request.params).toEqual({});
  });
});

describe('negotiateProtocolVersion', () => {
  it('echoes a version we support', () => {
    expect(negotiateProtocolVersion('2025-03-26')).toBe('2025-03-26');
  });

  it('falls back to the newest supported version for anything unknown', () => {
    expect(negotiateProtocolVersion('1999-01-01')).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateProtocolVersion(42)).toBe(LATEST_PROTOCOL_VERSION);
  });
});

describe('buildInitializeResult', () => {
  it('declares tools and resources, and nothing else', () => {
    const result = buildInitializeResult({
      requestedVersion: '2025-06-18',
      serverVersion: '0.35.1',
    });
    expect(result.protocolVersion).toBe('2025-06-18');
    // Resources joined tools on 2026-08-25. Neither declares listChanged: the
    // tool list is static per deploy, and the resource list changes only when
    // the user's own releases do.
    expect(result.capabilities).toEqual({ tools: {}, resources: {} });
    expect(result.serverInfo).toEqual({ name: 'urganize', version: '0.35.1' });
  });
});

describe('toolResultToMcp', () => {
  it('maps a successful result to text content with isError false', () => {
    const mapped = toolResultToMcp({ ok: true, summary: 'Done.' });
    expect(mapped.isError).toBe(false);
    expect(mapped.content).toEqual([{ type: 'text', text: 'Done.' }]);
  });

  it('appends structured data when present', () => {
    const mapped = toolResultToMcp({ ok: true, summary: 'Found 1.', data: { id: 'abc' } });
    const content = mapped.content as Array<{ text: string }>;
    expect(content[0].text).toContain('Found 1.');
    expect(content[0].text).toContain('"id": "abc"');
  });

  it('marks a failed tool with isError, not a JSON-RPC error', () => {
    const mapped = toolResultToMcp({ ok: false, summary: 'That release does not exist.' });
    expect(mapped.isError).toBe(true);
    expect(mapped.content).toEqual([{ type: 'text', text: 'That release does not exist.' }]);
  });

  it('drops clientAction (browser-only) by never reading it', () => {
    const mapped = toolResultToMcp({ ok: true, summary: 'Navigating…' });
    expect(JSON.stringify(mapped)).not.toContain('clientAction');
  });
});

describe('MCP tool surface', () => {
  // THE TRIPWIRE, INVERTED (2026-08-25). This list used to be a deny-list, so a
  // new Chappi tool joined MCP automatically and this count was what forced
  // somebody to notice. It is an allow-list now — a new tool is unreachable
  // until it is named — so the count no longer guards against accidental
  // exposure. It is kept because it still catches the opposite mistake: an
  // intended tool silently dropping out of the surface after a rename.
  it('exposes exactly the fourteen allow-listed tools (create_note left with the Notes cut, URG-319; complete_tasks added v1.170.0)', () => {
    const names = getMcpToolDescriptors().map((tool) => tool.name);
    expect(names).toHaveLength(14);
    expect(names).not.toContain('navigate');
    expect(names).not.toContain('get_team_workload');
    expect(names).toEqual(
      expect.arrayContaining([
        'get_workspace_context',
        'get_release_context',
        'compare_releases',
        'list_releases',
        'get_release',
        'list_tasks',
        'get_dashboard',
        'create_release',
        'create_task',
        'update_task',
        'complete_task',
        'complete_tasks',
        'reopen_task',
        'generate_status_update',
      ])
    );
  });

  it('emits camelCase inputSchema, not Anthropic snake_case', () => {
    for (const tool of getMcpToolDescriptors()) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool).not.toHaveProperty('input_schema');
    }
  });

  it('gates tools/call on the exposed set', () => {
    expect(isMcpToolName('list_releases')).toBe(true);
    expect(isMcpToolName('navigate')).toBe(false);
    expect(isMcpToolName('delete_everything')).toBe(false);
    // Real, registered, and deliberately unreachable here: deletes are
    // confirmation-gated and MCP has no way to show the card.
    expect(isMcpToolName('delete_release')).toBe(false);
    expect(isMcpToolName('delete_task')).toBe(false);
    expect(isMcpToolName('delete_note')).toBe(false);
  });
});

describe('resource URIs', () => {
  it('builds and parses a release URI symmetrically', () => {
    const uri = buildReleaseContextUri('11111111-2222-3333-4444-555555555555');
    expect(uri).toBe('urganize://release/11111111-2222-3333-4444-555555555555/context');
    expect(parseReleaseContextUri(uri)).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('refuses anything that is not exactly a release context URI', () => {
    // A lenient split would yield '' or a traversal string for several of
    // these, and the id it yields is fed straight to a lookup.
    for (const uri of [
      '',
      'urganize://workspace/context',
      'urganize://release//context',
      'urganize://release/abc',
      'urganize://release/abc/context/extra',
      'urganize://release/../../etc/context',
      'https://app.urganize.app/release/abc/context',
      'urganize://release/abc/CONTEXT',
    ]) {
      expect(parseReleaseContextUri(uri), uri).toBeNull();
    }
  });

  it('does not confuse the workspace URI for a release one', () => {
    expect(parseReleaseContextUri(WORKSPACE_CONTEXT_URI)).toBeNull();
  });

  it('describes resources as plain text, which is what they are', () => {
    expect(
      buildResourceDescriptor({ uri: WORKSPACE_CONTEXT_URI, name: 'n', description: 'd' })
    ).toEqual({
      uri: WORKSPACE_CONTEXT_URI,
      name: 'n',
      description: 'd',
      mimeType: 'text/plain',
    });
    expect(resourceTextResult('urganize://x', 'body')).toEqual({
      contents: [{ uri: 'urganize://x', mimeType: 'text/plain', text: 'body' }],
    });
  });
});

describe('the access-method resolver', () => {
  // MCP is all-POST and requireActiveAccount reads read-only mode off the
  // method, so this mapping is what lets a payment-lapsed team still take its
  // context out. Asserted against the REAL registry, not a fixture.
  it('treats every exposed read as a GET', () => {
    for (const name of ['get_workspace_context', 'get_release_context', 'list_releases', 'get_release', 'list_tasks', 'get_dashboard']) {
      expect(resolveMcpToolAccessMethod(name), name).toBe('GET');
    }
  });

  it('treats every exposed write as a POST', () => {
    for (const name of ['create_release', 'create_task', 'update_task', 'complete_task', 'reopen_task', 'generate_status_update']) {
      expect(resolveMcpToolAccessMethod(name), name).toBe('POST');
    }
  });

  it('treats an unknown name as a write, which is the safe reading', () => {
    expect(resolveMcpToolAccessMethod('nonsense')).toBe('POST');
    expect(resolveMcpToolAccessMethod('')).toBe('POST');
  });
});
