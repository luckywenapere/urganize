import { describe, expect, it } from 'vitest';
import {
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_PARSE_ERROR,
  LATEST_PROTOCOL_VERSION,
  buildInitializeResult,
  negotiateProtocolVersion,
  parseJsonRpcMessage,
  toolResultToMcp,
} from './protocol';
import { getMcpToolDescriptors, isMcpToolName } from './tools';

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
  it('declares tools as the only capability', () => {
    const result = buildInitializeResult({
      requestedVersion: '2025-06-18',
      serverVersion: '0.35.1',
    });
    expect(result.protocolVersion).toBe('2025-06-18');
    expect(result.capabilities).toEqual({ tools: {} });
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
  it('exposes the eleven Chappi tools and excludes navigate', () => {
    const names = getMcpToolDescriptors().map((tool) => tool.name);
    expect(names).toHaveLength(11);
    expect(names).not.toContain('navigate');
    expect(names).toEqual(
      expect.arrayContaining([
        'list_releases',
        'get_release',
        'list_tasks',
        'get_dashboard',
        'create_release',
        'create_task',
        'create_note',
        'update_task',
        'complete_task',
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
  });
});
