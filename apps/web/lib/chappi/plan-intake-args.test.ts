import { describe, expect, it } from 'vitest';
import { buildPlanIntake } from './tool-families/planner';

/**
 * The seam where a conversational answer becomes the same structure the
 * seven-screen modal produces. What matters here is not that the validator
 * works (it has its own tests) but that the model's arguments are shaped into
 * something it accepts — and that when they aren't, the error names the one
 * question worth re-asking.
 */
describe('buildPlanIntake', () => {
  const valid = {
    release_type: 'single',
    artist_name: 'Tems',
    release_date: '2026-11-20',
    date_mode: 'fixed',
    ready_today: ['master', 'artwork'],
    goal: 'playlist_adds',
    budget: 'under_100k',
  };

  it('builds a valid intake from complete answers', () => {
    const result = buildPlanIntake(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intake.version).toBe(2);
      expect(result.intake.release_type).toBe('single');
      expect(result.intake.artist_name).toBe('Tems');
      expect(result.intake.release_date).toBe('2026-11-20');
      expect(result.intake.ready_today).toEqual(['master', 'artwork']);
    }
  });

  it('injects version 2 rather than asking the model for it', () => {
    // The model is never told about `version` — it is a schema discriminator,
    // not one of the seven questions.
    const result = buildPlanIntake({ ...valid, version: undefined });
    expect(result.ok).toBe(true);
  });

  it('defaults date_mode to fixed when the model omits it', () => {
    const result = buildPlanIntake({ ...valid, date_mode: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intake.date_mode).toBe('fixed');
  });

  it('treats a missing release date as undecided rather than invalid', () => {
    const result = buildPlanIntake({ ...valid, release_date: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intake.release_date).toBeNull();
  });

  it('normalizes "none" to be exclusive of real ready items', () => {
    const result = buildPlanIntake({ ...valid, ready_today: ['master', 'none'] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intake.ready_today).toEqual(['none']);
  });

  it('accepts an empty ready_today — nothing ready is a real answer', () => {
    const result = buildPlanIntake({ ...valid, ready_today: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intake.ready_today).toEqual([]);
  });

  it('carries optional free text through, trimmed', () => {
    const result = buildPlanIntake({
      ...valid,
      goal_text: '  push the playlist angle hard  ',
      extra_notes: '  video lands a week late  ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intake.goal_text).toBe('push the playlist angle hard');
      expect(result.intake.extra_notes).toBe('video lands a week late');
    }
  });

  it('drops blank free text instead of storing empty strings', () => {
    const result = buildPlanIntake({ ...valid, goal_text: '   ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intake.goal_text).toBeUndefined();
  });

  // Each of these should name the offending field, so the model re-asks one
  // question rather than restarting the interview.
  it('names the field when the release type is wrong', () => {
    const result = buildPlanIntake({ ...valid, release_type: 'mixtape' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/release_type/);
  });

  it('names the field when the goal is wrong', () => {
    const result = buildPlanIntake({ ...valid, goal: 'go_viral' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/goal/);
  });

  it('names the field when the budget is wrong', () => {
    const result = buildPlanIntake({ ...valid, budget: '₦50,000' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/budget/);
  });

  it('names the field when the artist is missing', () => {
    const result = buildPlanIntake({ ...valid, artist_name: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/artist_name/);
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    const result = buildPlanIntake({ ...valid, release_date: '20th November' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/release_date/);
  });

  it('rejects an unknown ready item', () => {
    const result = buildPlanIntake({ ...valid, ready_today: ['master', 'merch'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ready_today/);
  });

  it('survives ready_today arriving as something other than an array', () => {
    // Models sometimes send a bare string. It should fail cleanly, not throw.
    const result = buildPlanIntake({ ...valid, ready_today: 'master' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.intake.ready_today).toEqual([]);
  });
});
