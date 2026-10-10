import { describe, expect, it } from 'vitest';

import { EP_RELEASE_TEMPLATE } from '@/lib/release-templates/ep';
import { ALBUM_RELEASE_TEMPLATE } from '@/lib/release-templates/album';
import { SINGLE_RELEASE_TEMPLATE } from '@/lib/release-templates/single';
import type { Template } from '@/lib/release-templates/types';

import {
  DISTRIBUTION_ORDER_LATEST_OFFSET_DAYS,
  DISTRIBUTION_ORDER_TASK_ID_BY_TEMPLATE,
  EDITORIAL_PITCH_OFFSET_DAYS,
  EDITORIAL_PITCH_TASK_ID,
  EMPTY_PITCH_FIELDS,
  LEGACY_PITCH_TASK_IDS,
  PITCH_DESCRIPTION_MAX,
  allPitchFieldsFilled,
  clampAtWord,
  daysToRelease,
  decideBackfill,
  isDistributionOrderTask,
  isEditorialPitchTask,
  isLegacyPitchTask,
  mergeDraftIntoEmpty,
  parsePitchDraft,
  parsePitchFields,
  pitchCounterCopy,
  pitchDueDate,
  pitchReminderCopy,
  pitchWindowState,
  reminderTierFor,
  validatePitchFieldsInput,
} from './editorial-pitch';

/** Noon in Lagos on 2026-10-10, so the Lagos day and the UTC day agree. */
const NOW = new Date('2026-10-10T11:00:00Z');

describe('daysToRelease', () => {
  it('counts calendar days from today in Lagos', () => {
    expect(daysToRelease('2026-10-17', NOW)).toBe(7);
    expect(daysToRelease('2026-10-10', NOW)).toBe(0);
    expect(daysToRelease('2026-10-09', NOW)).toBe(-1);
  });

  it('uses the Lagos day, not the UTC day', () => {
    // 23:30 UTC is already the next day in Lagos (UTC+1).
    const lateUtc = new Date('2026-10-10T23:30:00Z');
    expect(daysToRelease('2026-10-17', lateUtc)).toBe(6);
  });

  it('is null for a missing or impossible date', () => {
    expect(daysToRelease(null, NOW)).toBeNull();
    expect(daysToRelease('', NOW)).toBeNull();
    expect(daysToRelease('2026-02-30', NOW)).toBeNull();
    expect(daysToRelease('soon', NOW)).toBeNull();
  });
});

describe('pitchWindowState: the 7 day boundary', () => {
  it('is open at 8 days and closed at 7', () => {
    expect(pitchWindowState(8)).toBe('open');
    expect(pitchWindowState(7)).toBe('closed');
  });

  it('is closed all the way to release day, then past', () => {
    expect(pitchWindowState(1)).toBe('closed');
    expect(pitchWindowState(0)).toBe('closed');
    expect(pitchWindowState(-1)).toBe('past');
  });

  it('is unknown with no date', () => {
    expect(pitchWindowState(null)).toBe('unknown');
  });
});

describe('reminderTierFor', () => {
  it('fires the 28 day reminder from 28 down to 15 days out', () => {
    expect(reminderTierFor(28)).toBe(28);
    expect(reminderTierFor(15)).toBe(28);
  });

  it('fires the 14 day reminder from 14 down to 9 days out', () => {
    expect(reminderTierFor(14)).toBe(14);
    expect(reminderTierFor(9)).toBe(14);
  });

  it('fires the 8 day reminder on day 8 only', () => {
    expect(reminderTierFor(8)).toBe(8);
  });

  it('stops once the window has closed, and before day 28', () => {
    expect(reminderTierFor(7)).toBeNull();
    expect(reminderTierFor(0)).toBeNull();
    expect(reminderTierFor(-3)).toBeNull();
    expect(reminderTierFor(29)).toBeNull();
    expect(reminderTierFor(60)).toBeNull();
    expect(reminderTierFor(null)).toBeNull();
  });

  it('a missed cron day still lands on a tier, because they are windows', () => {
    // Day 28 was missed; on day 27 the same reminder is still due.
    expect(reminderTierFor(27)).toBe(28);
  });
});

describe('pitchReminderCopy', () => {
  it('counts to the day the window closes', () => {
    expect(pitchReminderCopy(28, 'Midnight')).toBe(
      'Your Spotify pitch for Midnight is due in 21 days.'
    );
    expect(pitchReminderCopy(14, 'Midnight')).toBe(
      'Your Spotify pitch for Midnight is due in 7 days.'
    );
  });

  it('says "1 day" in the singular', () => {
    expect(pitchReminderCopy(8, 'Midnight')).toBe(
      'Your Spotify pitch for Midnight is due in 1 day.'
    );
  });

  it('never goes negative and survives a blank title', () => {
    expect(pitchReminderCopy(3, '  ')).toBe('Your Spotify pitch for your rollout is due in 0 days.');
  });
});

describe('pitchDueDate', () => {
  it('is release day minus 28 when that is still ahead', () => {
    expect(pitchDueDate('2026-12-31', NOW)).toBe('2026-12-03T00:00:00.000Z');
  });

  it('is today when release day minus 28 has already passed', () => {
    // 2026-10-30 minus 28 days is 2026-10-02, before today (2026-10-10).
    expect(pitchDueDate('2026-10-30', NOW)).toBe('2026-10-10T00:00:00.000Z');
  });

  it('is exactly the offset on the boundary day', () => {
    expect(pitchDueDate('2026-11-07', NOW)).toBe('2026-10-10T00:00:00.000Z');
  });

  it('is null without a usable date', () => {
    expect(pitchDueDate(null, NOW)).toBeNull();
    expect(pitchDueDate('nope', NOW)).toBeNull();
  });
});

describe('decideBackfill: once-only rules', () => {
  const base = {
    daysToRelease: 40,
    hasPitchTask: false,
    hasOpenLegacyPitch: false,
    hasDoneLegacyPitch: false,
  };

  it('adds the task when the window is open and there is none', () => {
    expect(decideBackfill(base)).toBe('added');
  });

  it('adds it at 8 days but not at 7', () => {
    expect(decideBackfill({ ...base, daysToRelease: 8 })).toBe('added');
    expect(decideBackfill({ ...base, daysToRelease: 7 })).toBe('too_late');
  });

  it('does nothing when the task is already there, even if the window has closed', () => {
    expect(decideBackfill({ ...base, hasPitchTask: true })).toBe('present');
    expect(decideBackfill({ ...base, hasPitchTask: true, daysToRelease: 3 })).toBe('present');
  });

  it('converts an open old pitch instead of adding a second one', () => {
    expect(decideBackfill({ ...base, hasOpenLegacyPitch: true })).toBe('converted');
  });

  it('adds nothing when the old pitch was already done', () => {
    expect(decideBackfill({ ...base, hasDoneLegacyPitch: true })).toBe('already_pitched');
  });

  it('records nothing for a rollout with no usable date, so a later date still gets the task', () => {
    expect(decideBackfill({ ...base, daysToRelease: null })).toBeNull();
  });

  it('says too_late for a release day already in the past', () => {
    expect(decideBackfill({ ...base, daysToRelease: -5 })).toBe('too_late');
  });
});

describe('step ids', () => {
  it('recognises the pitch, the old pitches and the order steps', () => {
    expect(isEditorialPitchTask(EDITORIAL_PITCH_TASK_ID)).toBe(true);
    expect(isEditorialPitchTask('w5_editorial_pitch')).toBe(false);
    expect(isEditorialPitchTask(null)).toBe(false);
    for (const id of LEGACY_PITCH_TASK_IDS) expect(isLegacyPitchTask(id)).toBe(true);
    expect(isLegacyPitchTask(EDITORIAL_PITCH_TASK_ID)).toBe(false);
    expect(isDistributionOrderTask('w6_upload_to_distributor')).toBe(true);
    expect(isDistributionOrderTask('w6_upload_cover_art')).toBe(false);
  });
});

describe('the playbooks carry the pitch step the way the brief says', () => {
  const templates: Template[] = [SINGLE_RELEASE_TEMPLATE, EP_RELEASE_TEMPLATE, ALBUM_RELEASE_TEMPLATE];

  for (const template of templates) {
    describe(template.id, () => {
      const pitch = template.tasks.find((task) => task.id === EDITORIAL_PITCH_TASK_ID);
      const orderId = DISTRIBUTION_ORDER_TASK_ID_BY_TEMPLATE[template.id];
      const order = template.tasks.find((task) => task.id === orderId);

      it('has exactly one pitch step, due 28 days before release day', () => {
        expect(template.tasks.filter((task) => task.id === EDITORIAL_PITCH_TASK_ID)).toHaveLength(1);
        expect(pitch?.offset_days).toBe(EDITORIAL_PITCH_OFFSET_DAYS);
        expect(pitch?.optional).toBe(false);
      });

      it('has no leftover pitch step from the old playbook', () => {
        for (const id of LEGACY_PITCH_TASK_IDS) {
          expect(template.tasks.some((task) => task.id === id)).toBe(false);
        }
      });

      it('waits on the distribution order', () => {
        expect(order).toBeDefined();
        expect(pitch?.depends_on).toContain(orderId);
      });

      it('orders distribution at 35 days out or earlier', () => {
        expect(order?.offset_days).toBeLessThanOrEqual(DISTRIBUTION_ORDER_LATEST_OFFSET_DAYS);
      });

      it('uses the brief text', () => {
        expect(pitch?.title).toBe('Pitch to Spotify editorial');
        expect(pitch?.description).toContain(
          'Spotify needs this at least 7 days before release day. Earlier gives you a better shot.'
        );
      });

      it('survives the keep rule: tagged distribution so no scope or preset drops it', () => {
        expect(pitch?.tags).toContain('distribution');
      });
    });
  }
});

describe('clampAtWord', () => {
  it('leaves short text alone', () => {
    expect(clampAtWord('A warm, late-night record.', 500)).toBe('A warm, late-night record.');
  });

  it('cuts at a word, never over the limit, never mid-word', () => {
    const text = 'alpha beta gamma delta epsilon';
    const out = clampAtWord(text, 15);
    expect(out.length).toBeLessThanOrEqual(15);
    expect(out).toBe('alpha beta');
  });

  it('collapses whitespace and handles one long word', () => {
    expect(clampAtWord('a   b\n c', 50)).toBe('a b c');
    expect(clampAtWord('x'.repeat(40), 10)).toBe('x'.repeat(10));
  });
});

describe('pitch fields', () => {
  it('parses a draft, joining lists and clamping the description at 500', () => {
    const draft = parsePitchDraft({
      genre: 'Afrobeats',
      moods: ['Warm', 'Late night', ''],
      instruments: 'Log drum, keys',
      description: 'word '.repeat(200),
    });
    expect(draft.moods).toBe('Warm, Late night');
    expect(draft.description.length).toBeLessThanOrEqual(PITCH_DESCRIPTION_MAX);
    expect(draft.description.length).toBeGreaterThan(400);
  });

  it('gives empty fields for unusable input', () => {
    expect(parsePitchFields(null)).toEqual(EMPTY_PITCH_FIELDS);
    expect(parsePitchFields('text')).toEqual(EMPTY_PITCH_FIELDS);
    expect(parsePitchDraft({ genre: 5 })).toEqual(EMPTY_PITCH_FIELDS);
  });

  it('merge fills only empty fields and never overwrites typed text', () => {
    const existing = { genre: 'Highlife', moods: '', instruments: '', description: '' };
    const draft = { genre: 'Afrobeats', moods: 'Warm', instruments: 'Keys', description: 'A song.' };
    expect(mergeDraftIntoEmpty(existing, draft)).toEqual({
      genre: 'Highlife',
      moods: 'Warm',
      instruments: 'Keys',
      description: 'A song.',
    });
  });

  it('merge treats whitespace-only as empty', () => {
    const merged = mergeDraftIntoEmpty(
      { ...EMPTY_PITCH_FIELDS, genre: '   ' },
      { ...EMPTY_PITCH_FIELDS, genre: 'Soul' }
    );
    expect(merged.genre).toBe('Soul');
  });

  it('knows when every field is filled', () => {
    expect(allPitchFieldsFilled(EMPTY_PITCH_FIELDS)).toBe(false);
    expect(allPitchFieldsFilled({ genre: 'a', moods: 'b', instruments: 'c', description: 'd' })).toBe(true);
    expect(allPitchFieldsFilled({ genre: 'a', moods: ' ', instruments: 'c', description: 'd' })).toBe(false);
  });

  it('shows the counter as n/500', () => {
    expect(pitchCounterCopy(0)).toBe('0/500');
    expect(pitchCounterCopy(123)).toBe('123/500');
  });
});

describe('validatePitchFieldsInput', () => {
  it('accepts a normal save and trims', () => {
    const result = validatePitchFieldsInput({ genre: ' Soul ', description: 'Hi' });
    expect(result).toEqual({
      ok: true,
      fields: { genre: 'Soul', moods: '', instruments: '', description: 'Hi' },
    });
  });

  it('accepts exactly 500 characters and refuses 501, never cutting silently', () => {
    expect(validatePitchFieldsInput({ description: 'x'.repeat(500) }).ok).toBe(true);
    const over = validatePitchFieldsInput({ description: 'x'.repeat(501) });
    expect(over.ok).toBe(false);
  });

  it('refuses non-text and non-objects', () => {
    expect(validatePitchFieldsInput({ genre: 4 }).ok).toBe(false);
    expect(validatePitchFieldsInput(null).ok).toBe(false);
    expect(validatePitchFieldsInput('x').ok).toBe(false);
  });
});

describe('editorial platforms', () => {
  it('lists Spotify then Apple Music, each with its own link, label and steps', async () => {
    const { EDITORIAL_PLATFORMS } = await import('./editorial-pitch');
    expect(EDITORIAL_PLATFORMS.map((p) => p.id)).toEqual(['spotify', 'apple_music']);
    expect(EDITORIAL_PLATFORMS[1].url).toBe('https://artists.apple.com');
    for (const platform of EDITORIAL_PLATFORMS) {
      expect(platform.url.startsWith('https://')).toBe(true);
      expect(platform.linkLabel).toContain(platform.name);
      expect(platform.steps.length).toBeGreaterThan(20);
    }
  });

  it('never says release for the object and keeps every platform line under the house rules', async () => {
    const { EDITORIAL_PLATFORMS } = await import('./editorial-pitch');
    for (const platform of EDITORIAL_PLATFORMS) {
      expect(platform.steps).not.toMatch(/\brelease\b/i);
      expect(platform.steps).not.toMatch(/—|–/);
    }
  });
});
