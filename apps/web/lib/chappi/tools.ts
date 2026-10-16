// Chappi tool registry (SERVER-ONLY) — the public facade.
//
// Each tool declares an OpenAI-style input schema + kind, and an `execute` that
// follows the propose→validate→execute discipline: mutating tools call the
// EXISTING REST endpoints via an internal fetch so every side effect (template
// instantiation, assignee validation, notifications) is preserved and nothing
// is reimplemented — except completion/reopen, which need the dependency
// cascade the PATCH route lacks and so go through TaskService directly.
//
// The tools themselves live in ./tool-families/*, one file per domain, because
// the registry outgrew a single file. This module stays the only import site
// anyone outside lib/chappi/** should use (lib/mcp/tools.ts, runner.ts,
// dispatch.ts all import from here).
//
// Two conventions worth knowing before adding a tool:
//
// 1. READS in the newer families go through the REST route rather than a
//    service, which is a deliberate deviation from the core family. It keeps
//    each domain's feature flag and ownership rules defined in exactly one
//    place — the route — and makes the flag-off 404 translatable per request
//    (see isFlagGateOff). Registry-level flag gating would be wrong: the
//    NEXT_PUBLIC_* reads are inlined at build time.
// 2. A tool with a `confirm` builder is CONFIRMATION-GATED: the model can
//    propose it, but the runner refuses to execute it and the user has to
//    approve a card first (see runner.ts). A gated tool must never reach
//    lib/mcp/tools.ts's MCP_TOOL_NAMES_ALLOWED, because MCP has no
//    confirmation UI — tool-registry.test.ts asserts that structurally.

import { ARTIST_TOOLS } from './tool-families/artists';
import { CALENDAR_TOOLS } from './tool-families/calendar';
import { CAPTURE_TOOLS } from './tool-families/capture';
import { CONTEXT_TOOLS } from './tool-families/context';
import { CORE_TOOLS } from './tool-families/core';
import { DIRECTORY_TOOLS } from './tool-families/directory';
import { FILE_TOOLS } from './tool-families/files';
import { INSIGHTS_TOOLS } from './tool-families/insights';
import { METADATA_TOOLS } from './tool-families/metadata';
import { NOTE_TOOLS } from './tool-families/notes';
import { PLANNER_TOOLS } from './tool-families/planner';
import { PRESS_KIT_TOOLS } from './tool-families/press-kits';
import { PROMO_TOOLS } from './tool-families/promo';
import { RELEASE_TOOLS } from './tool-families/releases';
import { SHOW_TOOLS } from './tool-families/shows';
import { SONG_TOOLS } from './tool-families/song';
import { TEAM_TOOLS } from './tool-families/team';
import type { ChappiTool } from './tool-families/shared';

export type { ChappiTool, ChappiToolContext, ChappiConfirmOutcome } from './tool-families/shared';

// Feature cuts (Oct 16, 2026 brief, URG-319): shows, setlists and DJ packs,
// content calendars, notes and fan capture pages are off the nav, so UrgAns is
// not offered their tools either (their routes 404 with the flags forced off in
// next.config.js, and a tool that can only fail is a wrong answer waiting to
// happen). The song tools stay: a song is part of a rollout, not only a show.
const KEPT_SHOW_TOOL_NAMES = new Set(['list_songs', 'create_song']);
const SHOW_TOOLS_KEPT = SHOW_TOOLS.filter((tool) => KEPT_SHOW_TOOL_NAMES.has(tool.name));

/** Tool families that are cut, kept importable so restoring one is a line. */
export const CUT_CHAPPI_TOOLS: ChappiTool[] = [
  ...CALENDAR_TOOLS,
  ...NOTE_TOOLS,
  ...SHOW_TOOLS.filter((tool) => !KEPT_SHOW_TOOL_NAMES.has(tool.name)),
  ...CAPTURE_TOOLS,
  ...CORE_TOOLS.filter((tool) => tool.name === 'create_note'),
];

export const CHAPPI_TOOLS: ChappiTool[] = [
  ...CORE_TOOLS.filter((tool) => tool.name !== 'create_note'),
  ...CONTEXT_TOOLS,
  ...INSIGHTS_TOOLS,
  ...RELEASE_TOOLS,
  ...PLANNER_TOOLS,
  ...METADATA_TOOLS,
  ...SONG_TOOLS,
  ...TEAM_TOOLS,
  ...PROMO_TOOLS,
  ...SHOW_TOOLS_KEPT,
  ...PRESS_KIT_TOOLS,
  ...ARTIST_TOOLS,
  ...FILE_TOOLS,
  ...DIRECTORY_TOOLS,
];

// Cut tools are no longer OFFERED to the model (getChappiToolSchemas reads
// CHAPPI_TOOLS only) but stay resolvable by name, so a confirmation card that
// was proposed before the cut, or a stale client's confirmedAction, runs into
// its route's flag-off 404 and comes back as an ordinary error instead of an
// unknown-tool failure.
const TOOLS_BY_NAME = new Map<string, ChappiTool>(
  [...CHAPPI_TOOLS, ...CUT_CHAPPI_TOOLS].map((tool) => [tool.name, tool])
);

export function getChappiTool(name: string): ChappiTool | undefined {
  return TOOLS_BY_NAME.get(name);
}

/** True when this tool needs the user's approval before it may run. */
export function isConfirmationGated(name: string): boolean {
  return Boolean(TOOLS_BY_NAME.get(name)?.confirm);
}

/** OpenAI chat-completions tool schemas derived from the registry (the shape
 * the RodiumAi gateway's /v1/chat/completions expects). */
export function getChappiToolSchemas() {
  return CHAPPI_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}
