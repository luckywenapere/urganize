import { describe, expect, it } from 'vitest';
import { linkChip, storesChip } from './distribute-summary';

// Oct 22, 2026 at noon Lagos.
const NOW = Date.parse('2026-10-22T11:00:00Z');
const live = (over: Partial<{ status: string; url: string | null; presave_signups: number; stats: unknown }> = {}) => ({
  status: 'scheduled',
  url: 'https://altlink.co/free-mind',
  presave_signups: 0,
  stats: null,
  ...over,
});

describe('storesChip', () => {
  it('names no partner', () => {
    expect(storesChip('submitted')).toEqual({ label: 'Sent to stores', tone: 'live' });
    expect(storesChip('accepted')).toEqual({ label: 'Sent to stores', tone: 'live' });
    expect(storesChip('published')).toEqual({ label: 'In stores', tone: 'done' });
    expect(storesChip('rejected')).toEqual({ label: 'Needs a fix', tone: 'error' });
  });
  it('shows nothing before anything is sent', () => {
    expect(storesChip('preparing')).toBeNull();
    expect(storesChip(null)).toBeNull();
  });
});

describe('linkChip', () => {
  it('shows nothing until the rollout has a code and a release date (Altlink call, #852)', () => {
    expect(linkChip(null, '2026-11-06', NOW, false)).toBeNull();
    expect(linkChip(null, null, NOW, true)).toBeNull();
  });
  it('says when there is no link, or it is being made, or it failed', () => {
    expect(linkChip(null, '2026-11-06', NOW, true)).toEqual({ label: 'No smart link yet', tone: 'quiet' });
    expect(linkChip(live({ status: 'pending', url: null }), '2026-11-06', NOW)?.label).toBe('Making smart link');
    expect(linkChip(live({ status: 'failed' }), '2026-11-06', NOW)?.tone).toBe('error');
  });
  it('counts pre-saves before release day, the larger of the two counts', () => {
    expect(linkChip(live({ presave_signups: 3, stats: { presaves: 214 } }), '2026-11-06', NOW)?.label).toBe('214 pre-saves');
    expect(linkChip(live({ presave_signups: 1 }), '2026-11-06', NOW)?.label).toBe('1 pre-save');
    expect(linkChip(live(), '2026-11-06', NOW)?.label).toBe('Smart link live');
  });
  it('counts clicks once the song is out', () => {
    expect(linkChip(live({ stats: { clicks: 1380 } }), '2026-10-09', NOW)?.label).toBe('1,380 clicks');
  });
  it('never says pre-save link', () => {
    for (const row of [null, live(), live({ status: 'failed' })]) {
      expect(linkChip(row, '2026-11-06', NOW, true)?.label).not.toMatch(/pre-?save link/i);
    }
  });
});
