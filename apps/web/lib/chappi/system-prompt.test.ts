/**
 * The system prompt is the only place UrgAns is ever told creative/strategic
 * conversation is in scope, or told to be honest about data it doesn't have
 * (2026-09-03, closing a gap found while auditing UrgAns against a real-world
 * prompt list — see CLAUDE.md). Nothing type-checks a sentence, so the two
 * load-bearing behaviors get a content assertion each rather than trusting a
 * future prompt rewrite not to drop them silently.
 *
 * The coverage test below exists for a sharper reason. ROLE's "What you can
 * reach:" block is a HAND-MAINTAINED list of every tool, and the model's whole
 * idea of what this product can do comes from it — a tool absent from that
 * block is one the model never reaches for, even though its schema is still
 * sent. That is exactly how the assistant came to know nothing about shows,
 * press kits or the roster while their tools were being written (2026-09-07).
 * Registering a tool and telling the model about it are now one step, checked.
 */

import { describe, expect, it } from 'vitest';
import { ROLE } from './system-prompt';
import { CHAPPI_TOOLS } from './tools';

/**
 * Snake_case words the prompt uses as VALUES, not tool names — the intake
 * enums the model must translate a manager's phrasing into. They have to be
 * spelled out in the prompt, and they are not tools, so the staleness check
 * below skips them. Add to this only when the prompt gains a real enum value.
 */
const PROMPT_PROSE = new Set([
  'new_listeners',
  'playlist_adds',
  'fan_moment',
  'goal_text',
  'date_mode',
  'under_100k',
  'over_500k',
]);

describe('the system prompt', () => {
  it('names every insight tool it tells the model about', () => {
    expect(ROLE).toContain('compare_releases');
    expect(ROLE).toContain('get_team_workload');
  });

  it('sanctions ideation and strategy conversation with no tool call required', () => {
    expect(ROLE).toMatch(/creative direction/i);
    expect(ROLE).toMatch(/no tool call needed/i);
  });

  it('tells the model to admit it has no streaming, audience, or campaign data', () => {
    expect(ROLE).toMatch(/streaming numbers/i);
    expect(ROLE).toMatch(/say so plainly/i);
  });
});

describe('the capability list in ROLE', () => {
  it('names every registered tool, so none is invisible to the model', () => {
    const missing = CHAPPI_TOOLS.map((tool) => tool.name).filter(
      (name) => !ROLE.includes(name)
    );
    expect(
      missing,
      `ROLE's "What you can reach:" block does not mention: ${missing.join(', ')}. ` +
        'A tool the model is never told about is a tool it will not use.'
    ).toEqual([]);
  });

  it('mentions no tool that is not registered, so the list cannot go stale', () => {
    const registered = new Set(CHAPPI_TOOLS.map((tool) => tool.name));
    // Anything shaped like a tool name in the prompt. Deliberately loose: the
    // point is to catch a name left behind by a rename or a removal, the way
    // revoke_epk_link outlived its tool in CLAUDE.md for a month.
    const mentioned = new Set(ROLE.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+){1,4}\b/g) || []);
    const stale = [...mentioned].filter(
      (name) => name.includes('_') && !registered.has(name) && !PROMPT_PROSE.has(name)
    );
    expect(stale, `ROLE names tools that no longer exist: ${stale.join(', ')}`).toEqual([]);
  });
});
