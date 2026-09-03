/**
 * The system prompt is the only place UrgAns is ever told creative/strategic
 * conversation is in scope, or told to be honest about data it doesn't have
 * (2026-09-03, closing a gap found while auditing UrgAns against a real-world
 * prompt list — see CLAUDE.md). Nothing type-checks a sentence, so the two
 * load-bearing behaviors get a content assertion each rather than trusting a
 * future prompt rewrite not to drop them silently.
 */

import { describe, expect, it } from 'vitest';
import { ROLE } from './system-prompt';

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
