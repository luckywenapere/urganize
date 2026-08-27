import { describe, expect, it } from 'vitest';
import {
  BODY_MAX_LENGTH,
  DEFAULT_NOTIFICATION_PRESETS,
  TITLE_MAX_LENGTH,
  normalizeNotificationPresets,
} from './notification-presets';

describe('normalizeNotificationPresets', () => {
  it('returns full defaults for null', () => {
    expect(normalizeNotificationPresets(null)).toEqual(DEFAULT_NOTIFICATION_PRESETS);
  });

  it('returns full defaults for an empty object', () => {
    expect(normalizeNotificationPresets({})).toEqual(DEFAULT_NOTIFICATION_PRESETS);
  });

  it('returns full defaults for garbage input (string, array, number)', () => {
    expect(normalizeNotificationPresets('garbage')).toEqual(DEFAULT_NOTIFICATION_PRESETS);
    expect(normalizeNotificationPresets([1, 2, 3])).toEqual(DEFAULT_NOTIFICATION_PRESETS);
    expect(normalizeNotificationPresets(42)).toEqual(DEFAULT_NOTIFICATION_PRESETS);
  });

  it('merges a partial override, keeping other categories at their defaults', () => {
    const result = normalizeNotificationPresets({
      motivational: { enabled: false },
    });
    expect(result.motivational.enabled).toBe(false);
    expect(result.motivational.pool).toEqual(DEFAULT_NOTIFICATION_PRESETS.motivational.pool);
    expect(result.releaseReminders).toEqual(DEFAULT_NOTIFICATION_PRESETS.releaseReminders);
    expect(result.deadlineReminders).toEqual(DEFAULT_NOTIFICATION_PRESETS.deadlineReminders);
  });

  it('accepts a fully custom, valid pool and steps list', () => {
    const result = normalizeNotificationPresets({
      motivational: {
        enabled: true,
        pool: [{ id: 'custom', title: 'Custom title', body: 'Custom body' }],
      },
      releaseReminders: {
        enabled: true,
        steps: [{ id: '2d', delayMinutes: 2880, title: 'Custom step', body: 'Body {releaseTitle}' }],
      },
    });
    expect(result.motivational.pool).toEqual([{ id: 'custom', title: 'Custom title', body: 'Custom body' }]);
    expect(result.releaseReminders.steps).toEqual([
      { id: '2d', delayMinutes: 2880, title: 'Custom step', body: 'Body {releaseTitle}' },
    ]);
  });

  it('fills a missing title/body field-by-field from the positional default, keeping given fields', () => {
    const result = normalizeNotificationPresets({
      releaseReminders: { steps: [{ id: 'custom-id', delayMinutes: 100 }] },
    });
    expect(result.releaseReminders.steps).toEqual([
      {
        id: 'custom-id',
        delayMinutes: 100,
        title: DEFAULT_NOTIFICATION_PRESETS.releaseReminders.steps[0].title,
        body: DEFAULT_NOTIFICATION_PRESETS.releaseReminders.steps[0].body,
      },
    ]);
  });

  it('falls back to the full default step list for an explicitly empty steps array', () => {
    const result = normalizeNotificationPresets({
      releaseReminders: { steps: [] },
    });
    expect(result.releaseReminders.steps).toEqual(DEFAULT_NOTIFICATION_PRESETS.releaseReminders.steps);
  });

  it('clamps an overlong title and body to the broadcast limits', () => {
    const longTitle = 'x'.repeat(TITLE_MAX_LENGTH + 50);
    const longBody = 'y'.repeat(BODY_MAX_LENGTH + 50);
    const result = normalizeNotificationPresets({
      motivational: {
        pool: [{ id: 'long', title: longTitle, body: longBody }],
      },
    });
    expect(result.motivational.pool[0].title.length).toBe(TITLE_MAX_LENGTH);
    expect(result.motivational.pool[0].body.length).toBe(BODY_MAX_LENGTH);
  });

  it('normalizes deadline tier copy independently, defaulting missing tiers', () => {
    const result = normalizeNotificationPresets({
      deadlineReminders: {
        enabled: true,
        copy: {
          task_due_7d: { title: 'Custom 7d', body: 'Custom body 7d' },
        },
      },
    });
    expect(result.deadlineReminders.copy.task_due_7d).toEqual({ title: 'Custom 7d', body: 'Custom body 7d' });
    expect(result.deadlineReminders.copy.task_due_3d).toEqual(DEFAULT_NOTIFICATION_PRESETS.deadlineReminders.copy.task_due_3d);
    expect(result.deadlineReminders.copy.task_due_soon).toEqual(
      DEFAULT_NOTIFICATION_PRESETS.deadlineReminders.copy.task_due_soon
    );
  });

  it('ignores a non-boolean enabled flag and falls back to the default', () => {
    const result = normalizeNotificationPresets({ motivational: { enabled: 'yes' } });
    expect(result.motivational.enabled).toBe(DEFAULT_NOTIFICATION_PRESETS.motivational.enabled);
  });

  it('ignores a non-positive delayMinutes and falls back to the default', () => {
    const result = normalizeNotificationPresets({
      releaseReminders: { steps: [{ id: '1d', delayMinutes: -5, title: 'T', body: 'B' }] },
    });
    expect(result.releaseReminders.steps[0].delayMinutes).toBe(
      DEFAULT_NOTIFICATION_PRESETS.releaseReminders.steps[0].delayMinutes
    );
  });
});

describe('creditSubmissions category', () => {
  it('fills in from defaults when the stored blob predates it', () => {
    // Every row written before 2026-08-27 has no creditSubmissions key at all,
    // and must keep working without a migration.
    const presets = normalizeNotificationPresets({
      releaseReminders: { enabled: false },
      motivational: { enabled: false },
      deadlineReminders: { enabled: false },
    });
    expect(presets.creditSubmissions).toEqual(
      DEFAULT_NOTIFICATION_PRESETS.creditSubmissions
    );
  });

  it('honours an admin turning it off', () => {
    const presets = normalizeNotificationPresets({ creditSubmissions: { enabled: false } });
    expect(presets.creditSubmissions.enabled).toBe(false);
    // Copy still falls back rather than going blank.
    expect(presets.creditSubmissions.copy.title).toBe(
      DEFAULT_NOTIFICATION_PRESETS.creditSubmissions.copy.title
    );
  });

  it('keeps admin-edited copy and clamps it', () => {
    const presets = normalizeNotificationPresets({
      creditSubmissions: {
        enabled: true,
        copy: { title: 'T'.repeat(200), body: '  Someone answered  ' },
      },
    });
    expect(presets.creditSubmissions.copy.title).toHaveLength(TITLE_MAX_LENGTH);
    expect(presets.creditSubmissions.copy.body).toBe('Someone answered');
  });

  it('recovers from malformed copy of every shape', () => {
    for (const bad of [null, 'nope', 42, [], { title: 7, body: false }]) {
      const presets = normalizeNotificationPresets({ creditSubmissions: { copy: bad } });
      expect(presets.creditSubmissions.copy).toEqual(
        DEFAULT_NOTIFICATION_PRESETS.creditSubmissions.copy
      );
    }
  });

  it('ships enabled, so the feature works with zero admin edits', () => {
    expect(DEFAULT_NOTIFICATION_PRESETS.creditSubmissions.enabled).toBe(true);
  });
});
