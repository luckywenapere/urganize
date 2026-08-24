/**
 * Phase 2: the team brief.
 *
 * The prompt block and the permission rule are both pure, and both are the
 * kind of thing that fails silently — a brief that injects a bare heading
 * teaches the model to invent, and a permission default that flips the wrong
 * way locks a whole team out of a document any of them is supposed to edit.
 */

import { describe, expect, it } from 'vitest';
import {
  TEAM_BRIEF_SECTIONS,
  TEAM_BRIEF_SECTION_MAX_CHARS,
  TEAM_BRIEF_SECTION_META,
  canEditTeamBrief,
  formatTeamBriefForPrompt,
  isTeamBriefSection,
  normalizeBriefContent,
  type TeamBriefEntry,
} from './team-brief';

const entry = (section: string, content: string): TeamBriefEntry =>
  ({ section, content, updatedAt: null, updatedByName: null }) as TeamBriefEntry;

describe('sections', () => {
  it('every section has editor copy and a prompt heading', () => {
    for (const section of TEAM_BRIEF_SECTIONS) {
      const meta = TEAM_BRIEF_SECTION_META[section];
      expect(meta.label, section).toBeTruthy();
      expect(meta.promptLabel, section).toBeTruthy();
      expect(meta.placeholder, section).toBeTruthy();
    }
  });

  // Placeholders must be QUESTIONS, never example content: an example is
  // something the user has to delete, and one they fail to delete has taught
  // the model something untrue about their team.
  // Asserted as "contains a question", not "ends with one": a placeholder may
  // reasonably ask and then clarify ("What is off the table? Budget,
  // territories..."). Example content would contain no question mark at all,
  // which is the thing this is actually guarding against.
  it('every placeholder asks a question rather than showing an example', () => {
    for (const section of TEAM_BRIEF_SECTIONS) {
      expect(TEAM_BRIEF_SECTION_META[section].placeholder, section).toContain('?');
    }
  });

  it('rejects an unknown section', () => {
    expect(isTeamBriefSection('roster')).toBe(true);
    expect(isTeamBriefSection('budget')).toBe(false);
    expect(isTeamBriefSection(null)).toBe(false);
  });
});

describe('normalizeBriefContent', () => {
  it('trims and caps', () => {
    expect(normalizeBriefContent('  hello  ')).toBe('hello');
    expect(normalizeBriefContent('x'.repeat(5_000))).toHaveLength(TEAM_BRIEF_SECTION_MAX_CHARS);
  });

  it('treats anything that is not a string as empty', () => {
    expect(normalizeBriefContent(null)).toBe('');
    expect(normalizeBriefContent(42)).toBe('');
  });
});

describe('the prompt block', () => {
  it('injects nothing at all when the brief is empty', () => {
    expect(formatTeamBriefForPrompt([])).toBe('');
    expect(formatTeamBriefForPrompt([entry('roster', ''), entry('vocabulary', '   ')])).toBe('');
  });

  // A heading with nothing under it is an invitation to hallucinate.
  it('omits an empty section entirely rather than printing its heading', () => {
    const out = formatTeamBriefForPrompt([entry('roster', 'Zara, Tobi'), entry('constraints', '')]);
    expect(out).toContain('Zara, Tobi');
    expect(out).not.toContain(TEAM_BRIEF_SECTION_META.constraints.promptLabel);
  });

  // The spec's precedence rule, stated to the model in the block itself: the
  // brief is standing background and the live data wins.
  it('tells the model the live data outranks it', () => {
    const out = formatTeamBriefForPrompt([entry('roster', 'Zara')]);
    expect(out).toMatch(/standing background/i);
    expect(out).toMatch(/live data wins/i);
  });

  it('prints sections in the canonical order regardless of input order', () => {
    const out = formatTeamBriefForPrompt([
      entry('vocabulary', 'VOCAB'),
      entry('roster', 'ROSTER'),
      entry('positioning', 'POSITIONING'),
    ]);
    expect(out.indexOf('ROSTER')).toBeLessThan(out.indexOf('POSITIONING'));
    expect(out.indexOf('POSITIONING')).toBeLessThan(out.indexOf('VOCAB'));
  });

  it('caps a section that somehow arrived over-long', () => {
    const out = formatTeamBriefForPrompt([entry('roster', 'x'.repeat(9_000))]);
    expect(out.length).toBeLessThan(TEAM_BRIEF_SECTION_MAX_CHARS + 600);
  });
});

describe('who may edit', () => {
  // Any member by default — switching the feature on must not narrow anybody's
  // permissions.
  it('lets any member edit when the restriction is off', () => {
    for (const role of ['owner', 'admin', 'member']) {
      expect(canEditTeamBrief({ editRestricted: false, workspaceRole: role }), role).toBe(true);
    }
  });

  it('narrows to owner and admin when the restriction is on', () => {
    expect(canEditTeamBrief({ editRestricted: true, workspaceRole: 'owner' })).toBe(true);
    expect(canEditTeamBrief({ editRestricted: true, workspaceRole: 'admin' })).toBe(true);
    expect(canEditTeamBrief({ editRestricted: true, workspaceRole: 'member' })).toBe(false);
  });

  // Guests are read-only across the whole product; the brief is not an
  // exception, restriction on or off.
  it('never lets a guest edit', () => {
    expect(canEditTeamBrief({ editRestricted: false, workspaceRole: 'guest' })).toBe(false);
    expect(canEditTeamBrief({ editRestricted: true, workspaceRole: 'guest' })).toBe(false);
  });

  it('refuses someone with no membership at all', () => {
    expect(canEditTeamBrief({ editRestricted: false, workspaceRole: null })).toBe(false);
    expect(canEditTeamBrief({ editRestricted: false, workspaceRole: '' })).toBe(false);
  });
});
