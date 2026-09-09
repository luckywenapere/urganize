import { afterEach, describe, expect, it, vi } from 'vitest';

// intent-router reads its feature flags at MODULE scope (the NEXT_PUBLIC_*
// inlining pattern), so stubbing env after an import would be too late — each
// case re-imports the module with the flags it wants. Both flags are stubbed
// explicitly rather than read from the ambient environment: vitest does not
// load .env.local, and leaving either to chance would make these assertions
// depend on whoever ran them.
async function loadRouter(options: {
  notes: boolean;
  planner: boolean;
  events?: boolean;
  recap?: boolean;
}) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_FEATURE_NOTES', options.notes ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_RELEASE_PLANNER', options.planner ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_EVENTS', options.events ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_RELEASE_RECAP', options.recap ? 'true' : 'false');
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

  it('routes the word the control is named after', async () => {
    // The button says "New rollout", and buildHelpReply's own suggestion reads
    // "Create a new rollout" — those suggestions are clicked and fed back
    // through resolveIntent, so if this branch does not claim the word, the
    // chip answers with the help card it came from. Asserted with the ACTUAL
    // suggestion string rather than a paraphrase, so renaming the copy without
    // the keyword fails here.
    const { resolveIntent, buildHelpReply } = await loadRouter({ notes: true, planner: false });
    const suggestion = buildHelpReply().suggestions?.find((text) => /rollout/i.test(text));
    expect(suggestion).toBe('Create a new rollout');
    expect(resolveIntent(suggestion as string).kind).toBe('new_release');
    expect(resolveIntent('new rollout').kind).toBe('new_release');
    expect(resolveIntent('roll out my next one').kind).toBe('new_release');
  });

  it('leaves the word to the planner when the planner is on', async () => {
    // Same word, and the planner branch above claims it first — planning IS
    // how a rollout starts once that surface exists.
    const { resolveIntent } = await loadRouter({ notes: true, planner: true });
    expect(resolveIntent('new rollout').kind).toBe('plan_release');
  });
});

describe('resolveIntent — shows', () => {
  it('routes the phrases that can only be about a live date', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, events: true });
    for (const prompt of [
      "what's the setlist for Friday",
      'send the DJ pack to Tunde',
      'the run of show',
      'my shows this month',
      'do we have a gig in December',
      'which venue is it',
      'when is soundcheck',
    ]) {
      expect(resolveIntent(prompt), prompt).toEqual({ kind: 'open_shows' });
    }
  });

  it('NEVER claims the bare word "show"', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, events: true });
    // The whole difficulty of this branch. Routing either of these to the
    // shows page would be worse than not having the branch at all.
    expect(resolveIntent('show me my releases')).toEqual({ kind: 'plan_release' });
    expect(resolveIntent('show me what is due today')).toEqual({ kind: 'todays_focus' });
  });

  it('beats the planner branch on a set, and loses to it on a rollout', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, events: true });
    // 'plan' is in both, and a setlist is the more specific thing.
    expect(resolveIntent('plan the setlist')).toEqual({ kind: 'open_shows' });
    expect(resolveIntent('plan the rollout')).toEqual({ kind: 'plan_release' });
  });

  it('still lets an activity win, so "add a task about the setlist" is a task', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, events: true });
    expect(resolveIntent('add a task to finish the setlist')).toEqual({ kind: 'add_task' });
  });

  it('is silent when shows are switched off', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, events: false });
    // Falls through to the branches that were there before, rather than
    // offering a page that is not switched on. Neither of these matches any
    // other branch — "setlist" is not a release word — so both land on help,
    // which is exactly what they did before this branch existed.
    expect(resolveIntent("what's the setlist for Friday")).toEqual({ kind: 'help' });
    expect(resolveIntent('when is soundcheck')).toEqual({ kind: 'help' });
  });

  it('offers shows in the help card only where the feature exists', async () => {
    const on = await loadRouter({ notes: false, planner: false, events: true });
    expect(on.buildHelpReply().suggestions).toContain('My shows');
    const off = await loadRouter({ notes: false, planner: false, events: false });
    expect(off.buildHelpReply().suggestions).not.toContain('My shows');
  });
});

// The recap keyword, reassigned 2026-09-07.
//
// 'recap' used to sit in the status-update branch's keyword list, which was
// harmless while the recap card had a button of its own. That button was
// removed on a founder call, so the word has to reach the card it names —
// otherwise asking for a release recap silently produces a status paragraph.
//
// Placement is the load-bearing part: the release branch above claims
// 'release', so a recap branch AFTER it would never see "release recap".
describe('resolveIntent — the recap card', () => {
  it('routes the recap keyword to the recap card, not the status update', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, recap: true });
    for (const raw of ['recap', 'release recap', 'get me the recap card']) {
      expect(resolveIntent(raw).kind).toBe('generate_recap');
    }
  });

  it('leaves the status-update wording alone', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, recap: true });
    for (const raw of ['generate a status update', 'send me a status report', 'summary please']) {
      expect(resolveIntent(raw).kind).toBe('generate_status');
    }
  });

  it('does not claim "release" on its own — that is still the planner', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, recap: true });
    expect(resolveIntent('start a new release').kind).toBe('plan_release');
  });

  it('falls through when the recap flag is off', async () => {
    // With no recap to build, "recap" must not reach a dead end OR silently
    // become a status update. Help is the honest answer.
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, recap: false });
    expect(resolveIntent('release recap').kind).not.toBe('generate_recap');
  });
});
