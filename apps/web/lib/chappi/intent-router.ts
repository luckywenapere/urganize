// Deterministic intent router — the AI-off fallback that makes the Chappi
// front door useful before a capable model is wired (Phase 1), and the
// degraded-mode path the Phase 2 route falls back to when the model isn't
// configured. Pure functions, no model, no React, no I/O.

import type { ChappiChip, ChappiIntent, ChappiReply } from './types';

// With the planner on, the three planning chips take the place of the bare
// "New rollout" chip: planning IS how a release starts, and two doors that both
// mint releases makes neither of them the main one.
const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';

// Same flag the Notes page, its API routes and the nav entries read — the chip
// and the typed shortcut appear only where the feature itself does.
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

// Same flag the Song scene, its pill and the /song API routes read. The chip
// and the typed shortcut appear only where the feature itself does — and they
// matter more here than most: production runs with no model configured for
// long stretches, so this router IS the assistant, and "upload the song" has
// to reach the picker without one.
const SONG_UPLOAD_ENABLED = process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true';

// Same flag the Shows page, its nav tab and the /api/events routes read.
const EVENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EVENTS === 'true';
const RELEASE_RECAP_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_RECAP === 'true';

/**
 * "what's the setlist", "send the dj pack", "my shows this month".
 *
 * NEVER the bare word "show", and that is the whole difficulty of this branch:
 * "show me my releases" contains it, and routing that to the Shows page would
 * be worse than not having the branch at all. So every phrase here is one that
 * can only be about a live date.
 */
const SHOW_PHRASES: readonly RegExp[] = [
  /\bset\s?list\b/i,
  /\bdj\s+pack\b/i,
  /\brun\s+of\s+show\b/i,
  /\bmy\s+shows\b/i,
  /\bgigs?\b/i,
  /\bvenues?\b/i,
  /\bsoundcheck\b/i,
];

/**
 * "upload the song", "attach the master", "replace the audio".
 *
 * Keyword-matched in both word orders rather than anchored like the note
 * prefix: this intent carries no content, only a verb and a noun, and the two
 * arrive in either order ("upload the master" / "song upload"). It must be
 * checked BEFORE the release branch below, which already claims 'song' and
 * 'track' for "start a new release" — and AFTER the task branch, so "add a task
 * to upload the master" stays an activity.
 */
const SONG_NOUNS = 'song|master|audio|track|mp3|wav|flac';
const SONG_UPLOAD_PHRASES = [
  new RegExp(`\\b(upload|attach|re-?upload|replace)\\b[\\s\\S]{0,24}\\b(${SONG_NOUNS})\\b`, 'i'),
  new RegExp(`\\b(${SONG_NOUNS})\\b[\\s\\S]{0,16}\\b(upload|attached?)\\b`, 'i'),
];

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
    : [{ id: 'new-release', label: 'New rollout', intent: 'new_release' as const }]),
  { id: 'add-task', label: 'Add activity', intent: 'add_task' },
  ...(SONG_UPLOAD_ENABLED
    ? [{ id: 'upload-song', label: 'Upload the song', intent: 'upload_song' as const }]
    : []),
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
  // Before the planner/release branches, which already claim 'song' and
  // 'track' — "upload the song" is not "start a new release".
  if (SONG_UPLOAD_ENABLED && SONG_UPLOAD_PHRASES.some((pattern) => pattern.test(raw))) {
    return { kind: 'upload_song' };
  }
  // Before the planner AND release branches. "plan the setlist" is about a
  // set, not a rollout, and the release branch would otherwise claim it via
  // 'plan'; the release branch also claims 'song' and 'track', which a
  // conversation about a set is full of.
  if (EVENTS_ENABLED && SHOW_PHRASES.some((pattern) => pattern.test(raw))) {
    return { kind: 'open_shows' };
  }
  // Before the 'release' branch, and only when the planner exists: "plan my
  // release" contains both words, and planning is the more specific verb.
  if (PLANNER_ENABLED && has('plan', 'rollout', 'roll out', 'campaign')) {
    return { kind: 'plan_release' };
  }
  // BEFORE the release branch, which claims 'release' — otherwise "release
  // recap" is read as a request to start one. 'recap' moved out of the
  // status-update list below on 2026-09-07: harmless while the recap card had
  // a button of its own, wrong once that button was removed and the word had
  // to reach the card it names.
  if (RELEASE_RECAP_ENABLED && has('recap')) {
    return { kind: 'generate_recap' };
  }
  // 'rollout' is here because the CONTROL is called "New rollout" now, and a
  // suggestion in buildHelpReply below reads "Create a new rollout" — those
  // suggestions are clicked and fed straight back through this function, so
  // without the word that chip would answer with the help card it came from.
  // Someone who reads the button and types what it says deserves the same.
  // With the planner ON the branch above already claims 'rollout', so these
  // two are only ever reached with it off, which is exactly the state that
  // renders that suggestion.
  if (has('release', 'rollout', 'roll out', 'single', 'album', ' ep', 'drop', 'song', 'track', 'project')) {
    return { kind: PLANNER_ENABLED ? 'plan_release' : 'new_release' };
  }
  if (has('status', 'update', 'report', 'summary')) {
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
      PLANNER_ENABLED ? 'Plan a release' : 'Create a new rollout',
      'Add an activity',
      ...(SONG_UPLOAD_ENABLED ? ['Upload the song'] : []),
      ...(EVENTS_ENABLED ? ['My shows'] : []),
      ...(NOTES_ENABLED ? ['Note Call the promoter about Friday'] : []),
      'What should I focus on today?',
      'Generate a status update',
    ],
  };
}
