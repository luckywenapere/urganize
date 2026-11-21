import { describe, expect, it } from 'vitest';
import { describePlays, describeReleaseDayChoice, describeTrackStatus, formatMusicDay } from './copy';

describe('formatMusicDay', () => {
  it('reads a plain date as that day, whatever the machine time zone', () => {
    expect(formatMusicDay('2026-11-28')).toContain('28 Nov');
    expect(formatMusicDay('2026-11-28')).toContain('Sat');
  });

  it('puts a late-evening UTC moment on the next Lagos day', () => {
    // 23:00 UTC on the 27th is midnight on the 28th in Lagos.
    expect(formatMusicDay('2026-11-27T23:00:00Z')).toContain('28 Nov');
  });

  it('is empty for nothing or nonsense', () => {
    expect(formatMusicDay(null)).toBe('');
    expect(formatMusicDay('soon')).toBe('');
  });
});

describe('describeTrackStatus', () => {
  it('says each state in a sentence', () => {
    expect(describeTrackStatus({ status: 'draft', liveAt: null })).toBe('Not published yet');
    expect(describeTrackStatus({ status: 'taken_down', liveAt: null })).toBe('Taken down');
    expect(describeTrackStatus({ status: 'scheduled', liveAt: '2026-11-27T23:00:00Z' })).toBe(
      `Goes live on ${formatMusicDay('2026-11-27T23:00:00Z')}`
    );
    expect(describeTrackStatus({ status: 'live', liveAt: '2026-11-27T23:00:00Z' })).toContain('Live since');
  });

  it('tells the artist what a missing date is blocking', () => {
    expect(describeTrackStatus({ status: 'scheduled', liveAt: null })).toBe(
      'Goes live when you set a release date'
    );
  });
});

describe('describeReleaseDayChoice', () => {
  it('names the day, or says a date is needed', () => {
    expect(describeReleaseDayChoice('2026-11-28')).toContain('28 Nov');
    expect(describeReleaseDayChoice(null)).toContain('set a release date first');
  });
});

describe('describePlays', () => {
  it('counts plays with the right word', () => {
    expect(describePlays(0)).toBe('No plays yet');
    expect(describePlays(1)).toBe('1 play');
    expect(describePlays(1284)).toBe('1,284 plays');
  });
});
