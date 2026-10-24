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
import { CANONICAL_DESCRIPTION, CORE_CLAUSE, CORE_LINE, URGANS_LINE } from '../positioning';
import { ROLE, URGANS_COPY_RULES } from './system-prompt';
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
  // An argument, not a tool: create_release / generate_release_plan's flag for a
  // rollout UrgAns offered (2026-10-24, lib/rollout-origin.ts).
  'from_offer',
]);

describe('the system prompt', () => {
  it('offers a rollout only on a sign, and tags it (2026-10-24)', () => {
    expect(ROLE).toContain('Offer a rollout only when there is a sign.');
    expect(ROLE).toContain('pass from_offer true');
  });

  it('names every insight tool it tells the model about', () => {
    expect(ROLE).toContain('compare_releases');
    expect(ROLE).toContain('get_team_workload');
  });

  it('sanctions ideation and strategy conversation with no tool call required', () => {
    expect(ROLE).toMatch(/creative direction/i);
    expect(ROLE).toMatch(/no tool call needed/i);
  });

  it('describes what Urganize is, and itself as the AI inside it', () => {
    // UrgAns is a feature of the product, never the product, and that line is
    // the one thing in this prompt a later rewrite is most likely to blur.
    //
    // Since 2026-09-25 UrgAns says the same line as the rest of the product
    // (lib/positioning.ts). The opening sentence is PROSE, so it is held to the
    // shared constants here: change the line in positioning.ts and this fails
    // until somebody re-reads that sentence. The answer to "what is Urganize"
    // quotes the founder's lines by reference, so those two assertions catch
    // the reference being dropped, or the "word for word" instruction that
    // stops the model rewording them.
    expect(ROLE).toContain(`the ${URGANS_LINE} inside Urganize, ${CORE_CLAUSE}.`);
    expect(ROLE).toContain('If you are asked what Urganize is');
    expect(ROLE).toContain(`word for word: "${CORE_LINE}"`);
    expect(ROLE).toContain(`word for word: "${CANONICAL_DESCRIPTION}"`);
    // The category every other surface retired on 2026-09-24. This reads the
    // RENDERED prompt, which the positioning guard cannot: it scans source,
    // where the quoted lines are only `${...}` holes.
    expect(ROLE).not.toMatch(/Music Business Manager/i);
    // The 2026-09-24 line, replaced on 2026-10-17 (URG-344).
    expect(ROLE).not.toMatch(/everything after the music/i);
    // The word is banned everywhere a person reads it. The one place the prompt
    // may name it is the instruction that forbids it.
    expect(URGANS_COPY_RULES).toContain('workspace');
    expect(ROLE.split(URGANS_COPY_RULES).join(' ')).not.toMatch(/\bworkspaces?\b(?![_\w])/i);
  });

  it('tells the model to admit it has no streaming, audience, or campaign data', () => {
    expect(ROLE).toMatch(/streaming numbers/i);
    expect(ROLE).toMatch(/say so plainly/i);
  });

  it('tells the model not to use markdown, without quoting the forbidden syntax', () => {
    // 2026-09-24: the chat renderer now shows **bold** as bold rather than
    // literal asterisks, so ROLE's own instruction must never demonstrate
    // the thing it forbids — CLAUDE.md already records this exact trap for
    // em dashes in this same paragraph, and it is worth a real assertion
    // rather than a comment, since nothing type-checks a sentence.
    expect(ROLE).toMatch(/plain text, not markdown/i);
    expect(ROLE).toMatch(/asterisks/i);
    expect(ROLE).not.toContain('**');
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
    const registered = new Set<string>(CHAPPI_TOOLS.map((tool) => tool.name));
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
