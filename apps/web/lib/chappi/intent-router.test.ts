import { afterEach, describe, expect, it, vi } from 'vitest';

// intent-router reads its feature flags at MODULE scope (the NEXT_PUBLIC_*
// inlining pattern), so stubbing env after an import would be too late — each
// case re-imports the module with the flags it wants. Both flags are stubbed
// explicitly rather than read from the ambient environment: vitest does not
// load .env.local, and leaving either to chance would make these assertions
// depend on whoever ran them.
async function loadRouter(options: { notes: boolean; planner: boolean }) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_FEATURE_NOTES', options.notes ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_RELEASE_PLANNER', options.planner ? 'true' : 'false');
  return import('./intent-router');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveIntent — note capture', () => {
  it('captures the text after a "note" prefix as the note body', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true });
    expect(resolveIntent('note Call the promoter about Friday')).toEqual({
      kind: 'create_note',
      noteBody: 'Call the promoter about Friday',
    });
  });

  it('accepts the separators people actually type', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true });
    for (const raw of [
      'Note: Ring the mastering engineer',
      'note - Ring the mastering engineer',
      'take a note — Ring the mastering engineer',
      'make a note, Ring the mastering engineer',
    ]) {
      expect(resolveIntent(raw)).toEqual({
        kind: 'create_note',
        noteBody: 'Ring the mastering engineer',
      });
    }
  });

  it('keeps the body verbatim — case and line breaks survive', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true });
    // The body becomes the note, and its first line becomes the title, so
    // lowercasing it (as the keyword branches do to their copy) would ruin it.
    const intent = resolveIntent('note Chase ARTWORK from Dami\nthen send to DSPs');
    expect(intent.noteBody).toBe('Chase ARTWORK from Dami\nthen send to DSPs');
  });

  it('opens an empty note when there is nothing to capture', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true });
    for (const raw of ['note', 'Note.', '  take a note  ', 'new note']) {
      expect(resolveIntent(raw)).toEqual({ kind: 'take_note' });
    }
  });

  it('does not hijack sentences that merely mention a note', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true });
    // The prefix is anchored precisely so this stays an activity: the user's
    // verb is "add", and "task" is what they named.
    expect(resolveIntent('add a note to that task')).toEqual({ kind: 'add_task' });
  });

  it('stays dark when the notes feature is off', async () => {
    const { resolveIntent, CHAPPI_CHIPS } = await loadRouter({ notes: false, planner: true });
    expect(resolveIntent('note Call the promoter about Friday').kind).not.toBe('create_note');
    expect(resolveIntent('note').kind).not.toBe('take_note');
    expect(CHAPPI_CHIPS.some((chip) => chip.id === 'take-note')).toBe(false);
  });

  it('offers the chip when the notes feature is on', async () => {
    const { CHAPPI_CHIPS } = await loadRouter({ notes: true, planner: true });
    const chip = CHAPPI_CHIPS.find((entry) => entry.id === 'take-note');
    expect(chip).toEqual({ id: 'take-note', label: 'Take a note', intent: 'take_note' });
  });
});

describe('resolveIntent — existing branches are unaffected', () => {
  it('still routes the other intents', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true });
    expect(resolveIntent('add a task for the release').kind).toBe('add_task');
    expect(resolveIntent('plan my release').kind).toBe('plan_release');
    expect(resolveIntent('generate a status update').kind).toBe('generate_status');
    expect(resolveIntent('what should i focus on today?').kind).toBe('todays_focus');
    expect(resolveIntent('hello there').kind).toBe('help');
  });

  it('falls back to new_release when the planner is off', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: false });
    expect(resolveIntent('start a new single').kind).toBe('new_release');
  });
});
