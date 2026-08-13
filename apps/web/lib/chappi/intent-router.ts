// Deterministic intent router — the AI-off fallback that makes the Chappi
// front door useful before a capable model is wired (Phase 1), and the
// degraded-mode path the Phase 2 route falls back to when the model isn't
// configured. Pure functions, no model, no React, no I/O.

import type { ChappiChip, ChappiIntent, ChappiReply } from './types';

// With the planner on, the three planning chips take the place of the bare
// "New release" chip: planning IS how a release starts, and two doors that both
// mint releases makes neither of them the main one.
const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';

// Same flag the Notes page, its API routes and the nav entries read — the chip
// and the typed shortcut appear only where the feature itself does.
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

/**
 * "note <text>" — quick capture, the one intent that carries content.
 *
 * Anchored at the start rather than keyword-matched like the branches below,
 * for two reasons: the text after it is the note itself, so it can only be
 * read positionally; and an unanchored "note" would swallow every sentence
 * that merely mentions one ("add a note to that task" is an add_task).
 * A trailing separator is required, so a bare "note" falls through to opening
 * an empty editor instead of saving nothing.
 */
const NOTE_PREFIX = /^\s*(?:take\s+a\s+note|make\s+a\s+note|note)\s*[:,\-–—]?\s+(\S[\s\S]*)$/i;

/** Bare "note" / "take a note" with nothing after it. */
const BARE_NOTE = /^\s*(?:take\s+a\s+note|make\s+a\s+note|new\s+note|note)\s*[.!]?\s*$/i;

const PLANNER_CHIPS: ChappiChip[] = [
  {
    id: 'plan-single-6w',
    label: 'Plan a single dropping in 6 weeks',
    intent: 'plan_release',
    plannerPreset: { releaseType: 'single', weeksOut: 6 },
  },
  {
    id: 'plan-ep',
    label: 'Plan an EP rollout',
    intent: 'plan_release',
    plannerPreset: { releaseType: 'ep' },
  },
  {
    id: 'plan-small-budget',
    label: 'Plan a release with a small budget',
    intent: 'plan_release',
    plannerPreset: { budget: 'under_100k' },
  },
];

/** The quick-action chips shown under the prompt. Each maps to an existing
 * app action wired up in ChappiConversation. */
export const CHAPPI_CHIPS: ChappiChip[] = [
  ...(PLANNER_ENABLED
    ? PLANNER_CHIPS
    : [{ id: 'new-release', label: 'New release', intent: 'new_release' as const }]),
  { id: 'add-task', label: 'Add activity', intent: 'add_task' },
  ...(NOTES_ENABLED
    ? [{ id: 'take-note', label: 'Take a note', intent: 'take_note' as const }]
    : []),
];

/**
 * Map free-text to one of the deterministic intents by keyword. Order matters:
 * a phrase like "add an activity for the release" mentions both "task" and
 * "release", and the user's verb is add-a-task — so task is checked first.
 */
export function resolveIntent(raw: string): ChappiIntent {
  const text = raw.toLowerCase();
  const has = (...words: string[]) => words.some((word) => text.includes(word));

  // First, and anchored, so it beats the keyword branches without competing
  // with them: "note Call the promoter about the release" is a note, not a
  // release. Matching on the raw string keeps the note's own capitalisation.
  if (NOTES_ENABLED) {
    const captured = NOTE_PREFIX.exec(raw);
    if (captured) {
      return { kind: 'create_note', noteBody: captured[1].trim() };
    }
    if (BARE_NOTE.test(raw)) {
      return { kind: 'take_note' };
    }
  }

  if (has('task', 'to-do', 'todo', 'checklist item')) {
    return { kind: 'add_task' };
  }
  // Before the 'release' branch, and only when the planner exists: "plan my
  // release" contains both words, and planning is the more specific verb.
  if (PLANNER_ENABLED && has('plan', 'rollout', 'roll out', 'campaign')) {
    return { kind: 'plan_release' };
  }
  if (has('release', 'single', 'album', ' ep', 'drop', 'song', 'track', 'project')) {
    return { kind: PLANNER_ENABLED ? 'plan_release' : 'new_release' };
  }
  if (has('status', 'update', 'report', 'recap', 'summary')) {
    return { kind: 'generate_status' };
  }
  if (
    has('today', 'focus', "what's next", 'whats next', 'what should i', 'due', 'priority', 'blocked', 'blocker', 'next step')
  ) {
    return { kind: 'todays_focus' };
  }
  return { kind: 'help' };
}

/** The "here's what I can do" card for unmatched input. Suggestions are
 * example prompts the user can click to run. */
export function buildHelpReply(): ChappiReply {
  return {
    text: "I can help you run your releases. I'm still learning to chat — for now, try one of these:",
    suggestions: [
      PLANNER_ENABLED ? 'Plan a release' : 'Create a new release',
      'Add an activity',
      ...(NOTES_ENABLED ? ['Note Call the promoter about Friday'] : []),
      'What should I focus on today?',
      'Generate a status update',
    ],
  };
}
