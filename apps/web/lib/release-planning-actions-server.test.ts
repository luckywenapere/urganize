import { describe, expect, it } from 'vitest';

import {
  applyScopeExclusions,
  buildDraftFromTemplate,
  type ReleasePlanIntake,
} from './release-planning';
import { SINGLE_RELEASE_TEMPLATE } from './release-templates/single';
import {
  decidePlanCreationOnAiFailure,
  resolvePlanReleaseDate,
  summarizeRemovedTasks,
} from './release-planning-actions-server';

// The pure halves of createReleasePlan. The pipeline itself needs a database
// and a model, so what can be pinned here is the three decisions it makes
// with neither: which date the plan is built against, what a model failure
// does to the request, and what the manager is told was left out.

const OWNER = '11111111-1111-1111-1111-111111111111';

const baseIntake: ReleasePlanIntake = {
  version: 2,
  release_type: 'single',
  artist_name: 'Tola',
  date_mode: 'fixed',
  release_date: '2026-10-02',
  ready_today: ['master'],
  goal: 'playlist_adds',
  budget: 'under_100k',
};

describe('decidePlanCreationOnAiFailure', () => {
  it('proceeds untailored when no model is configured and nothing was typed', () => {
    expect(decidePlanCreationOnAiFailure('not_configured', baseIntake)).toEqual({
      action: 'proceed',
      warning: null,
    });
  });

  it('proceeds when no model is configured but says the typed notes were not read', () => {
    const decision = decidePlanCreationOnAiFailure('not_configured', {
      ...baseIntake,
      extra_notes: 'no listening party',
    });
    expect(decision.action).toBe('proceed');
    expect(decision.action === 'proceed' && decision.warning).toMatch(/notes/i);
  });

  it('REFUSES a one-off failure when the manager typed notes: nothing is built, they try again', () => {
    const decision = decidePlanCreationOnAiFailure('timeout', {
      ...baseIntake,
      extra_notes: 'a normal release, no marketing',
    });
    expect(decision).toEqual({
      action: 'refuse',
      status: 503,
      code: 'tailoring_unavailable',
      error: 'UrgAns could not read your notes just now. Try again in a moment.',
    });
  });

  it('counts the goal in their own words as typed text too', () => {
    const decision = decidePlanCreationOnAiFailure('unavailable', {
      ...baseIntake,
      goal_text: 'get on the big afrobeats playlists',
    });
    expect(decision.action).toBe('refuse');
  });

  it('proceeds from the selected answers alone on a one-off failure with nothing typed, and says so', () => {
    const decision = decidePlanCreationOnAiFailure('busy', baseIntake);
    expect(decision.action).toBe('proceed');
    expect(decision.action === 'proceed' && decision.warning).toBe(
      'UrgAns could not tailor the rest this time. The plan follows the playbook and your answers.'
    );
  });

  it('treats whitespace-only text as nothing typed', () => {
    const decision = decidePlanCreationOnAiFailure('invalid_output', {
      ...baseIntake,
      extra_notes: '   ',
      goal_text: '\n',
    });
    expect(decision.action).toBe('proceed');
  });
});

describe('resolvePlanReleaseDate', () => {
  it('prefers the date on the release row, trimmed to the day', () => {
    expect(resolvePlanReleaseDate('2026-11-06T00:00:00.000Z', baseIntake)).toEqual({
      releaseDate: '2026-11-06',
      fromIntake: false,
    });
  });

  it('falls back to the date the manager answered when the row has none', () => {
    expect(resolvePlanReleaseDate(null, baseIntake)).toEqual({
      releaseDate: '2026-10-02',
      fromIntake: true,
    });
  });

  it('answers null when neither has one', () => {
    expect(resolvePlanReleaseDate('', { ...baseIntake, release_date: null })).toBeNull();
  });
});

describe('summarizeRemovedTasks', () => {
  const doc = buildDraftFromTemplate({
    template: SINGLE_RELEASE_TEMPLATE,
    intake: { ...baseIntake, exclusions: ['marketing'] },
    ownerUserId: OWNER,
    generatedAt: '2026-07-30T09:00:00.000Z',
  });

  it('lists every task a scope removed, with the reason and who asked', () => {
    const excluded = applyScopeExclusions(doc, [
      { scope: 'marketing', by: 'intake', reason: 'You asked to leave out marketing and promo.' },
    ]);
    const removed = summarizeRemovedTasks(excluded);

    expect(removed.length).toBeGreaterThan(20);
    for (const entry of removed) {
      expect(entry.by).toBe('intake');
      expect(entry.reason).toBe('You asked to leave out marketing and promo.');
      expect(entry.title.length).toBeGreaterThan(0);
    }
    expect(removed.map((entry) => entry.id)).toEqual(
      excluded.tasks.filter((task) => task.removed).map((task) => task.id)
    );
  });

  it('lists nothing for a plan nothing was removed from', () => {
    expect(summarizeRemovedTasks(doc)).toEqual([]);
  });

  it('skips rows a manager removed by hand in an older document, which carry no reason', () => {
    const withUserRemoval = {
      ...doc,
      tasks: doc.tasks.map((task, index) =>
        index === 0 ? { ...task, removed: true, removed_by: 'user' as const, removed_reason: null } : task
      ),
    };
    expect(summarizeRemovedTasks(withUserRemoval)).toEqual([]);
  });
});
