// The MCP tool surface (SERVER-ONLY): Chappi's registry, minus the tools that
// only mean something inside a browser. Nothing is reimplemented here — the
// executors, their validation, and their REST/service call paths all stay in
// lib/chappi/tools.ts, so MCP and Chappi can never drift apart.
//
// Excluded, for two distinct reasons:
//
// 1. `navigate` returns a clientAction for the React router to perform. An MCP
//    client has no router, so exposing it would advertise a capability that
//    silently does nothing.
// 2. Everything added by the 2026-08-14 full-control expansion. Two things are
//    true of those tools that are not true of the original core set: several
//    are CONFIRMATION-GATED, and MCP has no confirmation UI to gate them with
//    (tool-registry.test.ts asserts every gated tool appears below); and the
//    ungated ones reach REST routes that do not accept the MCP internal-actor
//    bearer, so they would 401 rather than work. Opting any of them in means
//    switching its route to `requireAuthenticatedAdminOrInternal` and bumping
//    the count in protocol.test.ts — a conscious decision, which is the point
//    of that tripwire.

import { CHAPPI_TOOLS, type ChappiTool } from '@/lib/chappi/tools';
import type { ChappiToolName } from '@/lib/chappi/types';

/** Registry entries an MCP client must never see. */
const EXCLUDED_TOOL_NAMES: ReadonlySet<ChappiToolName> = new Set<ChappiToolName>([
  'navigate',
  // Release + task lifecycle
  'update_release',
  'schedule_release',
  'delete_release',
  'delete_task',
  'add_task_comment',
  // Notes
  'list_notes',
  'update_note',
  'delete_note',
  // Team
  'list_workspace_members',
]);

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
 * (Do NOT route this through getChappiToolSchemas(): that wraps each tool in
 * the OpenAI `{ type: 'function', function: {...} }` envelope.)
 */
export function getMcpToolDescriptors(): McpToolDescriptor[] {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}
