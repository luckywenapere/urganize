// Deterministic intent router — the AI-off fallback that makes the Chappi
// front door useful before a capable model is wired (Phase 1), and the
// degraded-mode path the Phase 2 route falls back to when the model isn't
// configured. Pure functions, no model, no React, no I/O.

import type { ChappiChip, ChappiIntent, ChappiReply } from './types';

/** The quick-action chips shown under the prompt. Each maps to an existing
 * app action wired up in ChappiHero. */
export const CHAPPI_CHIPS: ChappiChip[] = [
  { id: 'new-release', label: 'New release', intent: 'new_release' },
  { id: 'add-task', label: 'Add task', intent: 'add_task' },
  { id: 'todays-focus', label: "Today's focus", intent: 'todays_focus' },
  { id: 'generate-status', label: 'Generate status', intent: 'generate_status' },
];

/**
 * Map free-text to one of the deterministic intents by keyword. Order matters:
 * a phrase like "add a task for the release" mentions both "task" and
 * "release", and the user's verb is add-a-task — so task is checked first.
 */
export function resolveIntent(raw: string): ChappiIntent {
  const text = raw.toLowerCase();
  const has = (...words: string[]) => words.some((word) => text.includes(word));

  if (has('task', 'to-do', 'todo', 'checklist item')) {
    return { kind: 'add_task' };
  }
  if (has('release', 'single', 'album', ' ep', 'drop', 'song', 'track', 'project')) {
    return { kind: 'new_release' };
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
      'Create a new release',
      'Add a task',
      'What should I focus on today?',
      'Generate a status update',
    ],
  };
}
