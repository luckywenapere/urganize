// Shared plumbing for every Chappi tool family (SERVER-ONLY).
//
// Extracted from tools.ts when the registry grew past a single file's worth of
// tools. tools.ts remains the public facade — import CHAPPI_TOOLS/ChappiTool
// from there, not from here — so no call site outside lib/chappi/** changed.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ChappiToolKind,
  ChappiToolName,
  ChappiToolResult,
} from '../types';

export type ChappiToolContext = {
  user: { id: string; email?: string | null };
  adminClient: SupabaseClient;
  /** Workspaces the caller can access (from loadWorkspaceAccessContext). */
  workspaceIds: string[];
  /** Same-origin base for internal REST calls, e.g. "http://localhost:3000". */
  origin: string;
  /** The caller's bearer token, forwarded to the protected REST endpoints. */
  authToken: string;
};

export type ToolInputSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
};

/**
 * What a `confirm` builder returns. `ok: true` hands the runner the card copy;
 * `ok: false` is relayed to the model as an ordinary tool failure, so it can
 * correct the arguments and propose again (e.g. "that release has no date yet").
 */
export type ChappiConfirmOutcome =
  | { ok: true; title: string; detail?: string; confirmLabel: string }
  | { ok: false; summary: string };

export type ChappiTool = {
  name: ChappiToolName;
  kind: ChappiToolKind;
  description: string;
  inputSchema: ToolInputSchema;
  execute: (ctx: ChappiToolContext, args: Record<string, unknown>) => Promise<ChappiToolResult>;
  /**
   * Present = this tool is confirmation-gated: the model can propose it but the
   * runner will NOT execute it, and the user has to approve a card first. The
   * builder is READ-ONLY — it validates args and fetches whatever names/counts
   * the card needs to state the blast radius honestly.
   *
   * Every tool carrying this must also be in lib/mcp/tools.ts's
   * EXCLUDED_TOOL_NAMES (there is no confirmation UI over MCP);
   * tool-registry.test.ts asserts that structurally.
   */
  confirm?: (ctx: ChappiToolContext, args: Record<string, unknown>) => Promise<ChappiConfirmOutcome>;
};

// ── helpers ────────────────────────────────────────────────────────────────

export function argString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Reads an optional boolean; returns undefined when absent so callers can tell
 * "not mentioned" from "explicitly false". */
export function argBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function fail(summary: string): ChappiToolResult {
  return { ok: false, summary };
}

export type InternalApiResponse = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

export async function callInternalApi(
  ctx: ChappiToolContext,
  path: string,
  init: { method: string; body?: Record<string, unknown> }
): Promise<InternalApiResponse> {
  const response = await fetch(`${ctx.origin}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${ctx.authToken}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, body };
}

/**
 * True when a route 404'd because ITS FEATURE FLAG is off, as opposed to the
 * thing not existing. Every flag gate in the app answers with exactly
 * `{ error: 'Not found.' }`, while ownership misses say what was missing
 * ('Release not found.', 'Note not found.') — so this stays narrow enough that
 * a genuine ownership 404 still reaches the model intact.
 *
 * Translating per-request rather than filtering the registry is deliberate:
 * NEXT_PUBLIC_* reads are inlined at build time, so a registry-level gate would
 * bake one environment's answer into the bundle. Precedent: create_note.
 */
export function isFlagGateOff(response: InternalApiResponse): boolean {
  return response.status === 404 && response.body.error === 'Not found.';
}

/** Reads the route's own error message, falling back to a caller-supplied line. */
export function apiError(response: InternalApiResponse, fallback: string): string {
  const message = response.body.error;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export type CompactTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
};

export function compactTask(task: {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
}): CompactTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
  };
}

/** First non-empty line of a note body — the app treats it as the title
 * (the Apple Notes model), so the model should see the same thing. */
export function noteTitle(body: string): string {
  const firstLine = String(body || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 80) : 'Untitled note';
}
