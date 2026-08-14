import { describe, expect, it } from 'vitest';
import { CHAPPI_TOOLS, isConfirmationGated } from './tools';
import { isMcpToolName } from '@/lib/mcp/tools';

/**
 * Structural invariants over the whole tool registry. These exist because the
 * registry is data, not code paths — a malformed entry fails at runtime inside
 * a model turn, where nobody is watching, rather than at build time.
 */
describe('Chappi tool registry', () => {
  it('has unique, snake_case tool names', () => {
    const names = CHAPPI_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name, `${name} should be snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('gives every tool a description and an object schema', () => {
    for (const tool of CHAPPI_TOOLS) {
      expect(tool.description.trim(), `${tool.name} needs a description`).not.toBe('');
      expect(tool.inputSchema.type, `${tool.name} schema`).toBe('object');
      expect(typeof tool.inputSchema.properties, `${tool.name} properties`).toBe('object');
    }
  });

  it('lists every required property in its schema', () => {
    for (const tool of CHAPPI_TOOLS) {
      for (const required of tool.inputSchema.required ?? []) {
        expect(
          Object.keys(tool.inputSchema.properties),
          `${tool.name} requires "${required}" but does not declare it`
        ).toContain(required);
      }
    }
  });

  /**
   * The security tripwire. A confirmation-gated tool must never be reachable
   * over MCP, because MCP has no UI to show the card with — an MCP client
   * calling it would sail straight past the permission step the gate exists
   * for. Adding a gated tool without excluding it fails here.
   */
  it('never exposes a confirmation-gated tool over MCP', () => {
    const gated = CHAPPI_TOOLS.filter((tool) => tool.confirm).map((tool) => tool.name);
    expect(gated.length, 'expected at least one gated tool').toBeGreaterThan(0);
    for (const name of gated) {
      expect(isMcpToolName(name), `${name} is gated and must be excluded from MCP`).toBe(false);
    }
  });

  it('only gates mutating tools', () => {
    for (const tool of CHAPPI_TOOLS) {
      if (tool.confirm) {
        expect(tool.kind, `${tool.name} is gated so it should be a mutation`).toBe('mutate');
      }
    }
  });

  it('reports gated tools through isConfirmationGated', () => {
    expect(isConfirmationGated('delete_release')).toBe(true);
    expect(isConfirmationGated('list_releases')).toBe(false);
    expect(isConfirmationGated('nonexistent_tool')).toBe(false);
  });

  it('gates every delete tool', () => {
    const deleteTools = CHAPPI_TOOLS.filter((tool) => tool.name.startsWith('delete_'));
    expect(deleteTools.length).toBeGreaterThan(0);
    for (const tool of deleteTools) {
      expect(Boolean(tool.confirm), `${tool.name} deletes and must be gated`).toBe(true);
    }
  });
});
