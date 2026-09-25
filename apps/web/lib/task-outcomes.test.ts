import { describe, expect, it } from 'vitest';

import { CORE_CLAUSE, URGANS_LINE } from './positioning';
import {
  OUTCOME_SUMMARY_MAX_LENGTH,
  TASK_OUTCOME_LABELS,
  TASK_OUTCOME_RATINGS,
  buildOutcomeAiMessages,
  buildTemplateOutcomeSummary,
  isTaskOutcomeRating,
  mapTaskOutcomeRow,
  parseOutcomeAiResponse,
} from './task-outcomes';

describe('isTaskOutcomeRating', () => {
  it('accepts the three ratings', () => {
    for (const rating of TASK_OUTCOME_RATINGS) {
      expect(isTaskOutcomeRating(rating)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isTaskOutcomeRating('done')).toBe(false);
    expect(isTaskOutcomeRating('')).toBe(false);
    expect(isTaskOutcomeRating(null)).toBe(false);
    expect(isTaskOutcomeRating(undefined)).toBe(false);
    expect(isTaskOutcomeRating(2)).toBe(false);
    expect(isTaskOutcomeRating(['went_well'])).toBe(false);
  });
});

describe('TASK_OUTCOME_LABELS', () => {
  it('uses the specced copy', () => {
    expect(TASK_OUTCOME_LABELS.went_well).toBe('Went well');
    expect(TASK_OUTCOME_LABELS.went_okay).toBe('Went okay');
    expect(TASK_OUTCOME_LABELS.not_to_plan).toBe("Didn't go to plan");
  });

  it('obeys the copy rules: no em dashes, no comma before and', () => {
    for (const label of Object.values(TASK_OUTCOME_LABELS)) {
      expect(label).not.toMatch(/—/);
      expect(label).not.toMatch(/,\s+and\b/);
    }
  });
});

describe('buildTemplateOutcomeSummary', () => {
  it('is the label as a sentence when there is no note', () => {
    expect(buildTemplateOutcomeSummary('went_well', null)).toBe('Went well.');
    expect(buildTemplateOutcomeSummary('went_okay', '')).toBe('Went okay.');
    expect(buildTemplateOutcomeSummary('not_to_plan', '   ')).toBe("Didn't go to plan.");
  });

  it('appends a short note verbatim', () => {
    expect(buildTemplateOutcomeSummary('went_well', 'Artwork approved on the first pass.')).toBe(
      'Went well. Artwork approved on the first pass.'
    );
  });

  it('collapses a multiline note onto one line', () => {
    expect(buildTemplateOutcomeSummary('went_okay', 'Mix is back.\n\n  Notes sent   already.')).toBe(
      'Went okay. Mix is back. Notes sent already.'
    );
  });

  it('truncates a long note at a word boundary', () => {
    const note = 'word '.repeat(200).trim();
    const summary = buildTemplateOutcomeSummary('went_well', note);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary.length).toBeLessThanOrEqual('Went well. '.length + 141);
    expect(summary).not.toMatch(/wor…$/);
  });
});

describe('buildOutcomeAiMessages', () => {
  const messages = buildOutcomeAiMessages({
    taskTitle: 'Send the master to distribution',
    outcome: 'not_to_plan',
    note: 'Distributor rejected the WAV twice',
  });

  it('returns a system message and a user message', () => {
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('names UrgAns and demands JSON only', () => {
    expect(messages[0].content).toContain('UrgAns');
    expect(messages[0].content).toContain('JSON only');
    expect(messages[0].content).toContain('followupQuestion');
  });

  it('describes UrgAns and Urganize with the shared lines, not one of its own', () => {
    // The main UrgAns prompt and this one say the same thing (2026-09-25).
    // This one used to call the product "a rollout planning app".
    expect(messages[0].content).toContain(`UrgAns, the ${URGANS_LINE} inside Urganize, ${CORE_CLAUSE}.`);
    expect(messages[0].content).not.toMatch(/rollout planning app/i);
  });

  it('carries the task, the rating label, and the note', () => {
    expect(messages[1].content).toContain('Task: Send the master to distribution');
    expect(messages[1].content).toContain("Outcome: Didn't go to plan");
    expect(messages[1].content).toContain('Note: Distributor rejected the WAV twice');
  });
});

describe('parseOutcomeAiResponse', () => {
  it('parses a valid response', () => {
    const result = parseOutcomeAiResponse(
      '{"summary":"The distributor rejected the master twice.","followupQuestion":"What error did they give?"}'
    );
    expect(result).toEqual({
      summary: 'The distributor rejected the master twice.',
      followupQuestion: 'What error did they give?',
    });
  });

  it('parses a fenced response', () => {
    const result = parseOutcomeAiResponse('```json\n{"summary":"Artwork landed.","followupQuestion":null}\n```');
    expect(result?.summary).toBe('Artwork landed.');
    expect(result?.followupQuestion).toBeNull();
  });

  it('returns null when the summary is missing or empty', () => {
    expect(parseOutcomeAiResponse('{"followupQuestion":"How many?"}')).toBeNull();
    expect(parseOutcomeAiResponse('{"summary":"   "}')).toBeNull();
    expect(parseOutcomeAiResponse('{"summary":42}')).toBeNull();
  });

  it('returns null on unparseable input', () => {
    expect(parseOutcomeAiResponse('Sure! Here is your summary.')).toBeNull();
    expect(parseOutcomeAiResponse('')).toBeNull();
    expect(parseOutcomeAiResponse('[{"summary":"nope"}]')).toBeNull();
  });

  it('degrades a bad follow-up question to null instead of failing', () => {
    expect(parseOutcomeAiResponse('{"summary":"Done.","followupQuestion":""}')?.followupQuestion).toBeNull();
    expect(parseOutcomeAiResponse('{"summary":"Done.","followupQuestion":7}')?.followupQuestion).toBeNull();
    const long = 'a'.repeat(200);
    expect(parseOutcomeAiResponse(`{"summary":"Done.","followupQuestion":"${long}"}`)?.followupQuestion).toBeNull();
    expect(parseOutcomeAiResponse('{"summary":"Done.","followupQuestion":7}')?.summary).toBe('Done.');
  });

  it('strips em dashes from both fields', () => {
    const result = parseOutcomeAiResponse(
      '{"summary":"The mix came back — the notes were minor.","followupQuestion":"How many rounds — roughly?"}'
    );
    expect(result?.summary).toBe('The mix came back, the notes were minor.');
    expect(result?.followupQuestion).not.toMatch(/—/);
  });

  it('clamps an over-long summary', () => {
    const summary = 'word '.repeat(200).trim();
    const result = parseOutcomeAiResponse(JSON.stringify({ summary, followupQuestion: null }));
    expect(result?.summary.length).toBeLessThanOrEqual(OUTCOME_SUMMARY_MAX_LENGTH + 1);
    expect(result?.summary.endsWith('…')).toBe(true);
  });
});

describe('mapTaskOutcomeRow', () => {
  const row = {
    id: 'outcome-1',
    task_id: 'task-1',
    release_id: 'release-1',
    outcome: 'went_well',
    note: 'Approved first pass.',
    summary: 'Went well. Approved first pass.',
    ai_followup_question: 'How many revisions?',
    ai_followup_answer: 'One.',
    created_by: 'user-1',
    created_at: '2026-08-09T10:00:00.000Z',
    updated_at: '2026-08-09T10:00:00.000Z',
  };

  it('maps a full row to camelCase', () => {
    expect(mapTaskOutcomeRow(row)).toEqual({
      id: 'outcome-1',
      taskId: 'task-1',
      releaseId: 'release-1',
      outcome: 'went_well',
      note: 'Approved first pass.',
      summary: 'Went well. Approved first pass.',
      aiFollowupQuestion: 'How many revisions?',
      aiFollowupAnswer: 'One.',
      createdBy: 'user-1',
      createdAt: '2026-08-09T10:00:00.000Z',
    });
  });

  it('keeps null optional fields null', () => {
    const mapped = mapTaskOutcomeRow({
      ...row,
      note: null,
      ai_followup_question: null,
      ai_followup_answer: null,
    });
    expect(mapped?.note).toBeNull();
    expect(mapped?.aiFollowupQuestion).toBeNull();
    expect(mapped?.aiFollowupAnswer).toBeNull();
  });

  it('returns null for a missing row or an unknown rating', () => {
    expect(mapTaskOutcomeRow(null)).toBeNull();
    expect(mapTaskOutcomeRow({ ...row, outcome: 'went_great' })).toBeNull();
    expect(mapTaskOutcomeRow({ ...row, task_id: undefined })).toBeNull();
  });
});
