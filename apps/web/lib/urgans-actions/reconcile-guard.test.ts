import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { CHAPPI_TOOLS } from '../chappi/tools';
import { URGANS_ACTIONS } from './registry';

// Holds the two UrgAns surfaces in step.
//
// Every embedded action is a button inside a product surface. Most of them
// have a twin in the chat, because a manager who can tap "Draft the plan" can
// equally well ask for it in conversation — and that twin reaches the same
// data through the ordinary REST routes, bypassing the action runner entirely.
// That is fine, and deliberate (the gate is on the surface, not the
// capability: see chat-log-server.ts). What is NOT fine is the twin going
// unlogged, because then /admin/urgans reports half the drafting that
// happened and reads as though nobody used the feature.
//
// This file is what stops a THIRD action being registered without anybody
// deciding which of those two things it is. The declaration below is derived
// from the registry rather than hand-listed, so a new action fails this test
// until its author says either "here is the chat tool" or "there is not one,
// and here is why". A fixed pair list would only catch a rename.
//
// Modelled on tool-registry.test.ts (which asks a different question of the
// same sources) and registry-guard.test.ts.

const APP_ROOT = path.join(__dirname, '..', '..');
const familyDir = path.join(APP_ROOT, 'lib', 'chappi', 'tool-families');
const SERVER_FILE = path.join(__dirname, 'server.ts');

/**
 * The chat tools that do each embedded action's job.
 *
 * `tools: null` is a legitimate answer — some future action will have no
 * conversational twin at all — but it has to be spelled out, because the
 * difference between "there is no twin" and "somebody forgot" is the whole
 * thing this file exists to catch.
 */
type ChatCounterpart = { tools: string[] } | { tools: null; because: string };

const CHAT_COUNTERPARTS: Record<string, ChatCounterpart> = {
  'release.draft_plan': {
    // One tool, and one shot: since 2026-09-15 a plan is built in one call,
    // not drafted and later approved, so generate_release_plan logs straight
    // to 'applied' and there is nothing left to settle on a later turn.
    tools: ['generate_release_plan'],
  },
  'presskit.draft_section': {
    // One tool, and one shot: the words are composed in the transcript and
    // saved on assent, so there is no draft to settle afterwards.
    tools: ['write_press_kit_section'],
  },
};

/** The helper every chat tool logs through. Only recordChatActionRun exists
 *  now — a settle step (markChatActionApplied/markChatActionDiscarded) was
 *  deleted with the last two-step chat tool that needed one. */
const LOG_HELPERS = ['recordChatActionRun'] as const;

/**
 * One source chunk per tool, keyed by name.
 *
 * A local copy of tool-registry.test.ts's reader rather than a shared import:
 * the two guards ask unrelated questions of the same files, and exporting
 * machinery between test files to save twelve lines is worse than the twelve
 * lines. The four-space indentation on the `name:` key is load-bearing for
 * this split, exactly as it is there.
 */
function readToolSources(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of fs.readdirSync(familyDir)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = fs.readFileSync(path.join(familyDir, file), 'utf8');
    for (const chunk of source.split(/\n\s{4}name: '/).slice(1)) {
      out.set(chunk.slice(0, chunk.indexOf("'")), chunk);
    }
  }
  return out;
}

/** Comments legitimately name these helpers — this file's own prose does —
 *  so strip them before matching. The account-export and release-access
 *  guards' rule. */
const stripComments = (raw: string): string =>
  raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('every embedded action has a decided chat counterpart', () => {
  it('finds the registry and the tool sources (guards the walkers)', () => {
    expect(Object.keys(URGANS_ACTIONS).length).toBeGreaterThan(0);
    expect(CHAPPI_TOOLS.length).toBeGreaterThan(50);
    expect(readToolSources().size).toBeGreaterThan(50);
  });

  it('declares a counterpart for every registered action', () => {
    const undeclared = Object.keys(URGANS_ACTIONS).filter((id) => !CHAT_COUNTERPARTS[id]);
    expect(
      undeclared,
      `these embedded actions have no declared chat counterpart: ${undeclared.join(', ')}. ` +
        'Add an entry to CHAT_COUNTERPARTS naming the chat tool(s) that do the same job, ' +
        'or { tools: null, because: "..." } if there genuinely is not one. An undeclared ' +
        'action is one whose chat twin may be writing to the same data unlogged.'
    ).toEqual([]);
  });

  it('declares no counterpart for an action that no longer exists', () => {
    const stale = Object.keys(CHAT_COUNTERPARTS).filter((id) => !URGANS_ACTIONS[id]);
    expect(
      stale,
      `CHAT_COUNTERPARTS names actions that are not registered: ${stale.join(', ')}`
    ).toEqual([]);
  });

  it('names only chat tools that actually exist', () => {
    // Set<string>, not Set<ChappiToolName>: the declaration above holds plain
    // strings on purpose, so that a RENAMED tool shows up here as a missing
    // counterpart rather than as a type error in a test nobody is editing.
    const registered = new Set<string>(CHAPPI_TOOLS.map((tool) => tool.name));
    const missing: string[] = [];
    for (const [id, entry] of Object.entries(CHAT_COUNTERPARTS)) {
      for (const tool of entry.tools ?? []) {
        if (!registered.has(tool)) missing.push(`${id} -> ${tool}`);
      }
    }
    expect(
      missing,
      `these declared counterparts are not in the tool registry: ${missing.join(', ')}. ` +
        'A renamed tool leaves this declaration pointing at nothing.'
    ).toEqual([]);
  });

  it('requires a reason whenever an action declares no counterpart', () => {
    for (const [id, entry] of Object.entries(CHAT_COUNTERPARTS)) {
      if (entry.tools !== null) continue;
      expect(entry.because.trim().length, `${id} declares no counterpart but gives no reason`)
        .toBeGreaterThan(0);
    }
  });
});

describe('every chat counterpart writes to the action log', () => {
  const sources = readToolSources();
  const declared = Object.entries(CHAT_COUNTERPARTS).flatMap(([id, entry]) =>
    (entry.tools ?? []).map((tool) => [id, tool] as const)
  );

  it('has counterparts to check (guards the loop)', () => {
    expect(declared.length).toBeGreaterThan(0);
  });

  it('the comment stripper actually strips (guards the guard)', () => {
    expect(stripComments('// recordChatActionRun\nconst x = 1;')).not.toMatch(
      /recordChatActionRun/
    );
    expect(stripComments('await recordChatActionRun(')).toMatch(/recordChatActionRun/);
  });

  for (const [id, tool] of declared) {
    it(`${tool} logs its run (the chat door onto ${id})`, () => {
      const chunk = sources.get(tool);
      expect(chunk, `no source found for ${tool}`).toBeTruthy();
      const body = stripComments(chunk as string);
      const logs = LOG_HELPERS.some((helper) => body.includes(helper));
      expect(
        logs,
        `${tool} does the job of the embedded action ${id} but calls none of ` +
          `${LOG_HELPERS.join('/')}. Without one, /admin/urgans cannot see that this ` +
          'happened and will report the button as the only door anyone uses.'
      ).toBe(true);
    });
  }
});

describe('the log records the object type it was given', () => {
  it('runUrgansAction takes object_type from the scope, never a literal', () => {
    // This was hardcoded 'release' until 2026-09-07, so every embedded
    // press-kit draft was filed as a release — wrong in the console's own
    // grouping, and enough that a lookup filtering on object_type could never
    // find a kit's own drafted run. A second object type is exactly when that
    // kind of bug stops being theoretical.
    const source = stripComments(fs.readFileSync(SERVER_FILE, 'utf8'));
    expect(source).toMatch(/object_type:\s*scope\.objectType/);
    expect(
      source,
      "server.ts writes a literal object_type — take it from the resolved scope instead"
    ).not.toMatch(/object_type:\s*'/);
  });
});
