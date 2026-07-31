// The MCP tool surface (SERVER-ONLY): Chappi's registry, minus the tools that
// only mean something inside a browser. Nothing is reimplemented here — the
// executors, their validation, and their REST/service call paths all stay in
// lib/chappi/tools.ts, so MCP and Chappi can never drift apart.
//
// Excluded: `navigate`, which returns a clientAction for the React router to
// perform. An MCP client has no router, so exposing it would advertise a
// capability that silently does nothing.

import { CHAPPI_TOOLS, type ChappiTool } from '@/lib/chappi/tools';
import type { ChappiToolName } from '@/lib/chappi/types';

/** Registry entries an MCP client must never see. */
const EXCLUDED_TOOL_NAMES: ReadonlySet<ChappiToolName> = new Set<ChappiToolName>(['navigate']);

export const MCP_TOOLS: ChappiTool[] = CHAPPI_TOOLS.filter(
  (tool) => !EXCLUDED_TOOL_NAMES.has(tool.name)
);

const MCP_TOOL_NAMES: ReadonlySet<string> = new Set(MCP_TOOLS.map((tool) => tool.name));

/** True when the name is a tool this endpoint exposes. Guards tools/call so an
 * excluded-but-real Chappi tool can't be reached by name. */
export function isMcpToolName(name: string): boolean {
  return MCP_TOOL_NAMES.has(name);
}

export type McpToolDescriptor = {
  name: string;
  description: string;
  inputSchema: ChappiTool['inputSchema'];
};

/**
 * MCP `tools/list` descriptors. Read straight off the registry — which already
 * stores the schema under camelCase `inputSchema`, exactly what MCP wants.
 * (Do NOT route this through getChappiToolSchemas(): that renames the field to
 * Anthropic's snake_case `input_schema`.)
 */
export function getMcpToolDescriptors(): McpToolDescriptor[] {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}
