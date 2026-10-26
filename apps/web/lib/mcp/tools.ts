// The MCP tool surface (SERVER-ONLY): the subset of Chappi's registry that
// means something outside a browser. Nothing is reimplemented here — the
// executors, their validation, and their REST/service call paths all stay in
// lib/chappi/tools.ts, so MCP and Chappi can never drift apart.
//
// ── THIS IS AN ALLOW-LIST, AND IT USED TO BE A DENY-LIST ────────────────────
//
// Until 2026-08-25 this file listed what to EXCLUDE, so a newly registered
// Chappi tool joined MCP automatically and a hard-coded count in
// protocol.test.ts was the tripwire that made somebody notice. That default was
// defensible while exactly one founder-held env key could reach the endpoint. It
// is not defensible now that any customer can connect their own LLM client:
// "exposed unless someone remembers to exclude it" is the wrong direction for a
// list that is the ONLY thing standing between an outside model and a
// confirmation-gated tool.
//
// Why it is the only thing: executeToolCall in lib/chappi/dispatch.ts never
// reads `tool.confirm`. The gate lives in lib/chappi/runner.ts, which the MCP
// path does not go through, because a confirmation card needs a UI that an MCP
// client does not have. So a gated tool reaching this list is a gated tool that
// executes unconfirmed.
//
// Adding a tool here is therefore a security decision, and it needs THREE
// things to be true:
//   1. It has no `confirm` builder (tool-registry.test.ts asserts this
//      structurally, and asserts every delete_* tool is gated).
//   2. If it proxies one of our REST routes, that route accepts the internal
//      actor — otherwise it 401s and we have advertised a tool that cannot
//      work. This exact mistake shipped once: create_note was listed for weeks
//      while POST /api/notes used the plain auth helper. There is a test for it
//      now.
//   3. It does not return a `clientAction`, which addresses a React router and
//      modals that do not exist outside the app (`navigate`, `upload_cover_art`).

import { CHAPPI_TOOLS, getChappiTool, type ChappiTool } from '@/lib/chappi/tools';
import type { ChappiToolName } from '@/lib/chappi/types';

/**
 * Exactly what an MCP client may see and call.
 *
 * Ordered as the registry orders it, so a diff against `tools/list` reads
 * straight down. Anything not named here is unreachable — including a tool
 * added to lib/chappi tomorrow.
 */
export const MCP_TOOL_NAMES_ALLOWED: readonly ChappiToolName[] = [
  // Context — the reason per-user access exists at all.
  'get_workspace_context',
  'get_release_context',
  // Insights — cross-entity reads, no different in kind from the context pair.
  // get_team_workload is NOT here: it proxies GET /api/workspace/members,
  // whose handler does not accept the internal actor (same reason
  // list_workspace_members below it in Chappi's own registry never made this
  // list either) — it would 401 for any MCP client. compare_releases has no
  // such route dependency, so it's clean.
  'compare_releases',
  // Reads.
  'list_releases',
  'get_release',
  'list_tasks',
  'get_dashboard',
  // Writes that are visible and undoable in the app. No deletes: every
  // delete_* tool is confirmation-gated and has no card to show here.
  'create_release',
  'create_task',
  // create_note left with the Notes cut (Oct 16, 2026, URG-319).
  'update_task',
  'complete_task',
  'complete_tasks',
  'reopen_task',
  'generate_status_update',
] as const;

const ALLOWED: ReadonlySet<string> = new Set<string>(MCP_TOOL_NAMES_ALLOWED);

/**
 * The allowed tools, resolved against the live registry.
 *
 * A name that no longer exists in lib/chappi silently drops out rather than
 * throwing, and `tool-registry.test.ts` asserts the two lists agree — so a
 * renamed tool is a failing test, not a tool that quietly vanished from the
 * surface.
 */
export const MCP_TOOLS: ChappiTool[] = CHAPPI_TOOLS.filter((tool) => ALLOWED.has(tool.name));

/** True when the name is a tool this endpoint exposes. Guards tools/call so a
 * real-but-unlisted Chappi tool can't be reached by name. */
export function isMcpToolName(name: string): boolean {
  return ALLOWED.has(name) && Boolean(getChappiTool(name));
}

/**
 * Which HTTP method the access gate should judge this tool by.
 *
 * MCP is all-POST, and requireActiveAccount reads read-only mode off the
 * method — so handing it the real method would refuse a payment-lapsed team its
 * MCP READS as well as its writes, while that same team can still read
 * everything in the app. A read is therefore a GET.
 *
 * An unknown name answers POST: the safe reading, matching requireActiveAccount's
 * own treatment of an absent method.
 */
export function resolveMcpToolAccessMethod(name: string): 'GET' | 'POST' {
  return getChappiTool(name)?.kind === 'read' ? 'GET' : 'POST';
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
