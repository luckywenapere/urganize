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
  recap?: boolean;
  share?: boolean;
}) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_FEATURE_NOTES', options.notes ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_RELEASE_PLANNER', options.planner ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_RELEASE_RECAP', options.recap ? 'true' : 'false');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_SOCIAL_SHARE', options.share ? 'true' : 'false');
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

  it('routes the word THE TASK control is named after, which is the same bug twice', async () => {
    // The exact shape of the 'rollout' case above, on the other branch: tasks
    // were renamed "activities" in the UI, the chip reads "Add activity" and
    // buildHelpReply suggests "Add an activity" — and the add_task branch was
    // never told the word, so the one suggestion the help card makes answered
    // with the help card again. Asserted against the ACTUAL chip label and the
    // ACTUAL suggestion, not a paraphrase, so renaming either without teaching
    // the branch fails here rather than in someone's chat.
    const { resolveIntent, buildHelpReply, CHAPPI_CHIPS } = await loadRouter({
      notes: true,
      planner: true,
    });
    const suggestion = buildHelpReply().suggestions?.find((text) => /activity/i.test(text));
    expect(suggestion).toBe('Add an activity');
    expect(resolveIntent(suggestion as string)).toEqual({ kind: 'add_task' });

    const chip = CHAPPI_CHIPS.find((c) => c.intent === 'add_task');
    expect(chip?.label).toBe('Add activity');
    expect(resolveIntent(chip?.label as string)).toEqual({ kind: 'add_task' });

    // Plural, and the phrase a manager actually types.
    expect(resolveIntent('add an activity for the release')).toEqual({ kind: 'add_task' });
    expect(resolveIntent('show me my activities')).toEqual({ kind: 'add_task' });
  });
});

// Shows were deleted (Oct 17, 2026) and song upload removed everywhere the
// same day: neither has a typed shortcut any more.
describe('resolveIntent — deleted shortcuts', () => {
  it('has no shows branch', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true });
    expect(resolveIntent("what's the setlist for Friday")).toEqual({ kind: 'help' });
    expect(resolveIntent('when is soundcheck')).toEqual({ kind: 'help' });
    expect(resolveIntent('show me what is due today')).toEqual({ kind: 'todays_focus' });
  });

  it('offers neither shows nor a song upload in the chips or the help card', async () => {
    const { buildHelpReply, CHAPPI_CHIPS } = await loadRouter({ notes: false, planner: false });
    expect(buildHelpReply().suggestions).not.toContain('My shows');
    expect(buildHelpReply().suggestions).not.toContain('Upload the song');
    expect(CHAPPI_CHIPS.map((chip) => chip.label)).not.toContain('Upload the song');
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

// Share to socials (2026-09-23). The typed path matters for the same reason
// every branch here does: production runs with no model configured for long
// stretches, and then this router IS the assistant.
//
// The danger is the neighbours. 'single', 'song' and 'rollout' are claimed by
// the planner and release branches, 'status' by the status update, and
// 'recap' by the recap card, so the cases below are mostly about what this
// branch must NOT take.
describe('resolveIntent — share to socials', () => {
  it('routes the phrases that can only be about announcing', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, share: true });
    for (const raw of [
      'post it on instagram',
      'make me an insta post',
      'put it on my whatsapp status',
      'share to socials',
      'something for social media',
      'announce the single',
      'share my new single',
      'share the rollout',
    ]) {
      expect(resolveIntent(raw).kind, raw).toBe('share_socials');
    }
  });

  it('routes X, Twitter and Snapchat too (2026-09-24)', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, share: true });
    for (const raw of [
      'post it on twitter',
      'tweet about the single',
      'post it on X',
      'share the release to x',
      'put the new single on x',
      'post it on snapchat',
      'make a snap story for the single',
    ]) {
      expect(resolveIntent(raw).kind, raw).toBe('share_socials');
    }
  });

  it('never reads a bare x as X, the platform', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: false, share: true });
    // No posting verb, or an x that is part of a word: none of these is about X.
    for (const raw of ['x', 'export the credits to xlsx', 'what is 2x the budget', 'remind me about Xavier']) {
      expect(resolveIntent(raw).kind, raw).not.toBe('share_socials');
    }
    // And an activity still wins, exactly as it does for Instagram.
    expect(resolveIntent('add a task to post on x').kind).toBe('add_task');
  });

  it('beats the planner on "share the single", which would otherwise plan a new one', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, share: true });
    expect(resolveIntent('share the single').kind).toBe('share_socials');
    // ...and does not claim the planner's own wording.
    expect(resolveIntent('plan my rollout').kind).toBe('plan_release');
    expect(resolveIntent('start a new single').kind).toBe('plan_release');
  });

  it('leaves a status update a status update', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: false, share: true });
    expect(resolveIntent('share a status update with the artist').kind).toBe('generate_status');
    expect(resolveIntent('generate a status update').kind).toBe('generate_status');
    // "single" is inside the generic phrase's reach here, and the answer must
    // still not be the share sheet. (Where it DOES land is the release branch's
    // older claim on 'single', which this change leaves alone.)
    expect(resolveIntent('share a status update on the single').kind).not.toBe('share_socials');
    // A platform's name still wins over the word "update".
    expect(resolveIntent('post an update on instagram').kind).toBe('share_socials');
  });

  it('stands aside for the recap card, which has its own share button', async () => {
    const { resolveIntent } = await loadRouter({
      notes: true,
      planner: true,
      recap: true,
      share: true,
    });
    // Each of these names a platform or "share … release", so the share branch
    // WOULD claim it if it did not stand aside. A mutation test found the first
    // version of this case ("share the recap card") could never have caught
    // that: it matched no share phrase to begin with.
    for (const raw of ['share the release recap', 'post the recap on instagram']) {
      expect(resolveIntent(raw).kind, raw).toBe('generate_recap');
    }
  });

  it('reads "with the team" as access, not an announcement', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, share: true });
    expect(resolveIntent('share the single with the team').kind).not.toBe('share_socials');
  });

  it('lets an activity win, so "add a task to post on instagram" is a task', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, share: true });
    expect(resolveIntent('add a task to post on instagram').kind).toBe('add_task');
  });

  it('does not touch "show me my releases" or a plain question', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true, share: true });
    expect(resolveIntent('show me my releases').kind).not.toBe('share_socials');
    expect(resolveIntent('what should I focus on today?').kind).toBe('todays_focus');
    // "installed" contains "insta" but not as a word.
    expect(resolveIntent('I installed the app').kind).not.toBe('share_socials');
  });

  it('is silent when sharing is switched off', async () => {
    const { resolveIntent, buildHelpReply } = await loadRouter({
      notes: true,
      planner: true,
      share: false,
    });
    expect(resolveIntent('post it on instagram').kind).not.toBe('share_socials');
    expect(buildHelpReply().suggestions).not.toContain('Share to socials');
  });

  it('offers it in the help card when on, and the suggestion runs', async () => {
    const { resolveIntent, buildHelpReply } = await loadRouter({
      notes: true,
      planner: true,
      share: true,
    });
    const suggestions = buildHelpReply().suggestions ?? [];
    expect(suggestions).toContain('Share to socials');
    expect(resolveIntent('Share to socials').kind).toBe('share_socials');
  });
});

/**
 * The recommended prompts (2026-09-08). What is pinned here is the SHAPE and
 * the DEGRADE, not the wording: the founder should be able to rewrite a label
 * without a test failing, but not to accidentally ship a chip that does the
 * wrong thing when no model is configured.
 */
describe('CHAPPI_CHIPS — the recommended prompts', () => {
  it('gives every chip exactly one of ask or intent', async () => {
    const { CHAPPI_CHIPS } = await loadRouter({ notes: true, planner: true });
    for (const chip of CHAPPI_CHIPS) {
      const isAsk = chip.ask !== undefined;
      const isAction = chip.intent !== undefined;
      expect(
        isAsk !== isAction,
        `chip "${chip.id}" must be exactly one of ask or action`
      ).toBe(true);
    }
  });

  it('leads with the orientation question', async () => {
    // The founder's stated finding is that people arrive wanting to know what
    // Urganize is. Pinned so a reorder is a deliberate edit rather than a side
    // effect of adding a chip to the top of the list.
    const { CHAPPI_CHIPS } = await loadRouter({ notes: true, planner: true });
    expect(CHAPPI_CHIPS[0]?.id).toBe('what-can-you-do');
  });

  it('never ships an empty ask, which would send a blank turn', async () => {
    const { CHAPPI_CHIPS } = await loadRouter({ notes: true, planner: true });
    for (const chip of CHAPPI_CHIPS) {
      if (chip.ask !== undefined) expect(chip.ask.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * THE DEGRADE, and the reason these two were chosen over prettier wording.
   * With no model configured an ask chip falls through to resolveIntent, so a
   * chip whose text lands on a real branch keeps working. Rewording either of
   * these past its keyword silently turns a working chip into the help card.
   */
  it('keeps the daily and status prompts working with no model configured', async () => {
    const { CHAPPI_CHIPS, resolveIntent } = await loadRouter({ notes: true, planner: true });
    const focus = CHAPPI_CHIPS.find((chip) => chip.id === 'todays-focus');
    const status = CHAPPI_CHIPS.find((chip) => chip.id === 'status-update');
    expect(resolveIntent(focus?.ask ?? '')).toEqual({ kind: 'todays_focus' });
    expect(resolveIntent(status?.ask ?? '')).toEqual({ kind: 'generate_status' });
  });

  it('lands the orientation prompt on the help card rather than acting on it', async () => {
    // It mentions neither a release nor a verb the router claims, so with no
    // model it answers "here is what I can do" — which is the honest reply to
    // "what can you help me with", and not a modal nobody asked to open.
    const { CHAPPI_CHIPS, resolveIntent } = await loadRouter({ notes: true, planner: true });
    const orientation = CHAPPI_CHIPS.find((chip) => chip.id === 'what-can-you-do');
    expect(resolveIntent(orientation?.ask ?? '')).toEqual({ kind: 'help' });
  });

  it('offers a release action whichever way the planner flag is set', async () => {
    const planned = await loadRouter({ notes: true, planner: true });
    expect(planned.CHAPPI_CHIPS.find((chip) => chip.id === 'plan-release')?.intent).toBe(
      'plan_release'
    );
    const unplanned = await loadRouter({ notes: true, planner: false });
    expect(unplanned.CHAPPI_CHIPS.find((chip) => chip.id === 'new-release')?.intent).toBe(
      'new_release'
    );
  });
});

describe('buildHelpReply — the fallback prompt list', () => {
  it('only suggests things that run without a model', async () => {
    // This card exists precisely when the model does not, so every line on it
    // must resolve to a real deterministic branch. 'help' would mean the card
    // suggesting itself.
    const { buildHelpReply, resolveIntent } = await loadRouter({
      notes: true,
      planner: true,
    });
    for (const suggestion of buildHelpReply().suggestions ?? []) {
      expect(resolveIntent(suggestion).kind, `"${suggestion}" resolves to help`).not.toBe('help');
    }
  });
});

describe('resolveIntent — "rollout" is the word users type now (2026-09-09)', () => {
  it('routes "rollout" exactly like "release" with the planner on', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: true });
    expect(resolveIntent('new rollout').kind).toBe(resolveIntent('new release').kind);
    expect(resolveIntent('plan my rollout').kind).toBe('plan_release');
    expect(resolveIntent('start a new rollout').kind).toBe('plan_release');
  });

  it('and with the planner off, so nobody who learned the old word is stranded', async () => {
    const { resolveIntent } = await loadRouter({ notes: true, planner: false });
    expect(resolveIntent('new rollout').kind).toBe('new_release');
    expect(resolveIntent('new release').kind).toBe('new_release');
  });
});

describe('resolveIntent — edits never open a creation flow', () => {
  const edits = [
    'Change the title of the song to ‘Honest’',
    "change the title of the song to 'Honest'",
    'Rename the single to Honest',
    'rename this rollout',
    'Edit the release date of the track',
    'update the name of the album',
    'change the song title',
    'set the release date for the single to Nov 6',
    'call it "Honest"',
  ];

  it.each([true, false])('routes edits to the help card (planner %s)', async (planner) => {
    const { resolveIntent } = await loadRouter({ notes: true, planner, share: true, recap: true });
    for (const text of edits) {
      expect(resolveIntent(text), text).toEqual({ kind: 'help' });
    }
  });

  it('still starts and plans rollouts, and still writes status updates', async () => {
    const { resolveIntent, CHAPPI_CHIPS } = await loadRouter({ notes: true, planner: true });
    expect(resolveIntent('Plan a rollout').kind).toBe('plan_release');
    expect(resolveIntent('new song').kind).toBe('plan_release');
    expect(resolveIntent('Generate a status update').kind).toBe('generate_status');
    const statusChip = CHAPPI_CHIPS.find((chip) => chip.id === 'status-update');
    expect(resolveIntent(statusChip?.ask ?? '').kind).toBe('generate_status');
    expect(resolveIntent('Add an activity').kind).toBe('add_task');
  });
});
