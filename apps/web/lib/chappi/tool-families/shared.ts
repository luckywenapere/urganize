// Shared plumbing for every Chappi tool family (SERVER-ONLY).
//
// Extracted from tools.ts when the registry grew past a single file's worth of
// tools. tools.ts remains the public facade — import CHAPPI_TOOLS/ChappiTool
// from there, not from here — so no call site outside lib/chappi/** changed.

import type { SupabaseClient } from '@supabase/supabase-js';
import { URGANS_PASS_HEADER } from '@/lib/urgans-pass-header';
import type { UrgansActionSource, UrgansToolLevel } from '@/lib/urgans-action-log';
import type {
  ChappiToolKind,
  ChappiToolName,
  ChappiToolResult,
} from '../types';

export type ChappiToolContext = {
  user: { id: string; email?: string | null };
  adminClient: SupabaseClient;
  /** Workspaces the caller can access (from loadWorkspaceAccessContext).
   *  Tasks are scoped by this — `tasks.workspace_id` exists. */
  workspaceIds: string[];
  /**
   * Owners of every workspace the caller belongs to, always including the
   * caller. RELEASES ARE SCOPED BY THIS, NOT BY workspaceIds: the `releases`
   * table has no workspace_id, it has `owner_user_id`, so whole-workspace
   * visibility is the union of those owners (founder decision, 2026-07-23).
   * Normalized non-empty by resolveChappiContext.
   */
  releaseOwnerIds: string[];
  /**
   * Artist-scoped memberships, keyed by OWNER user id. An artist invited to a
   * manager's team sees only that owner's releases whose `artist_id` matches.
   *
   * REQUIRED, and required on purpose: this map is the only thing standing
   * between whole-workspace visibility and an artist reading a manager's whole
   * roster. An optional field is one a caller forgets, and forgetting it here
   * fails OPEN. Never resolve releases from releaseOwnerIds without it — use
   * listVisibleReleases in ../release-scope.ts, which pairs them by
   * construction.
   */
  artistScopeByOwnerId: Record<string, string>;
  /** The same scopes keyed by workspace id, for task/board checks. */
  artistScopeByWorkspaceId: Record<string, string>;
  /** Chosen-rollout limits (#853), keyed by OWNER user id. Required for the
   * same fail-open reason as artistScopeByOwnerId. Empty list = no rollouts. */
  releaseScopeByOwnerId: Record<string, string[]>;
  /** The same rollout limits keyed by workspace id. */
  releaseScopeByWorkspaceId: Record<string, string[]>;
  /** Same-origin base for internal REST calls, e.g. "http://localhost:3000". */
  origin: string;
  /** The caller's bearer token, forwarded to the protected REST endpoints. */
  authToken: string;
  /**
   * A live UrgAns pass (lib/urgans-pass.ts), present ONLY for a credits-only
   * team that holds credits. It rides along on every internal call so the
   * paywall gate lets this team's assistant act. Absent for everyone else,
   * whose requests are gated exactly as before.
   */
  urgansPass?: string;
  /**
   * Where this call came from, for the action log (lib/urgans-action-log.ts).
   * Absent means a typed chat turn. Set by the route that builds the context:
   * voice for a voice call, mcp for MCP.
   */
  audit?: { source: UrgansActionSource; trigger?: string };
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
  | {
      ok: true;
      title: string;
      detail?: string;
      confirmLabel: string;
      /** The card's second button, when "Cancel" is the wrong word ("Fix something"). */
      cancelLabel?: string;
      /** The card makes the user type this phrase (or DELETE) before the button
       * works, and sends what they typed as args.confirmation. */
      typedConfirmation?: { phrase: string };
      /**
       * The arguments to run with when the user approves. Absent means the ones
       * the model sent. An approved card replays its arguments, so a builder that
       * resolved something the model only named (a playlist found by its name)
       * returns the resolved arguments here, and approving runs exactly what the
       * card showed instead of looking the name up a second time (#1272).
       */
      args?: Record<string, unknown>;
    }
  | { ok: false; summary: string };

export type ChappiTool = {
  name: ChappiToolName;
  kind: ChappiToolKind;
  /** Permission level: read, suggest, confirm or auto. Required on every tool;
   *  tool-registry.test.ts holds it to `kind` and to `confirm`. Writes (confirm
   *  and auto) are logged by dispatch.ts. */
  level: UrgansToolLevel;
  description: string;
  inputSchema: ToolInputSchema;
  execute: (ctx: ChappiToolContext, args: Record<string, unknown>) => Promise<ChappiToolResult>;
  /**
   * Present = this tool is confirmation-gated: the model can propose it but the
   * runner will NOT execute it, and the user has to approve a card first. The
   * builder is READ-ONLY — it validates args and fetches whatever names/counts
   * the card needs to state the blast radius honestly.
   *
   * Every tool carrying this must be kept OUT of lib/mcp/tools.ts's
   * MCP_TOOL_NAMES_ALLOWED (there is no confirmation UI over MCP);
   * tool-registry.test.ts asserts that structurally. That list was a deny-list
   * named EXCLUDED_TOOL_NAMES until 2026-08-25, when per-user MCP access
   * inverted it to an allow-list so a new tool is unreachable by default.
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

/** Reads an optional number; returns undefined when absent or unusable, so a
 * caller can tell "not mentioned" from a real 0. Accepts a numeric string
 * because a model will sometimes send "25" for a number field. */
export function argNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Reads an array of non-empty strings, dropping anything else. Empty array
 * when the key is absent or holds no usable entries. */
export function argStringArray(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
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
      ...(ctx.urgansPass ? { [URGANS_PASS_HEADER]: ctx.urgansPass } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, body };
}

/**
 * True when a route 404'd because ITS FEATURE FLAG is off, as opposed to the
 * thing not existing. A flag gate answers with a bare 'Not found', while
 * ownership misses say what was missing ('Rollout not found.', 'Show not
 * found.', 'Note not found.') — so this stays narrow enough that a genuine
 * ownership 404 still reaches the model intact.
 *
 * BOTH SPELLINGS, with and without the full stop. The newer route groups
 * (events, press kits, notes, the directory) write 'Not found.' and say so in
 * their headers; thirteen older handlers across workspace, the workspace logo,
 * the roster and task attachments write 'Not found'. Every one of those
 * thirteen is a feature-flag gate — checked, not assumed — and they mean the
 * same thing, so recognising one spelling and not the other made a
 * switched-off feature report itself as missing. Fixing it here rather than in
 * thirteen routes across five surfaces keeps the contract in the one place
 * that has to read it.
 *
 * Translating per-request rather than filtering the registry is deliberate:
 * NEXT_PUBLIC_* reads are inlined at build time, so a registry-level gate would
 * bake one environment's answer into the bundle. Precedent: create_note.
 */
export function isFlagGateOff(response: InternalApiResponse): boolean {
  if (response.status !== 404) return false;
  return response.body.error === 'Not found.' || response.body.error === 'Not found';
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
