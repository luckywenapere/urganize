import { describe, expect, it } from 'vitest';
import {
  NAV_STALL_MAX_PER_MINUTE,
  NAV_STALL_MIN_GAP_MS,
  allowStallReport,
  describeConnection,
  didNavigate,
  shouldReportStall,
} from './nav-stall';

describe('didNavigate', () => {
  it('is false for the same address', () => {
    expect(didNavigate('https://a.test/dashboard?release=1', 'https://a.test/dashboard?release=1')).toBe(false);
  });

  it('is true when the release param goes away (the back arrow landing)', () => {
    expect(didNavigate('https://a.test/dashboard?release=1', 'https://a.test/dashboard')).toBe(true);
  });

  it('is true when only the scene changes (a menu row landing)', () => {
    expect(
      didNavigate('https://a.test/dashboard?release=1', 'https://a.test/dashboard?release=1&scene=song')
    ).toBe(true);
  });

  it('ignores a hash-only change, which is not the navigation being waited for', () => {
    expect(didNavigate('https://a.test/dashboard?release=1', 'https://a.test/dashboard?release=1#x')).toBe(false);
  });

  it('does not treat an unparseable address as different from itself', () => {
    expect(didNavigate('::::', '::::')).toBe(false);
  });
});

describe('shouldReportStall', () => {
  const same = 'https://a.test/dashboard?release=1';

  it('reports when the page is visible and the address did not change', () => {
    expect(shouldReportStall({ before: same, after: same, visible: true })).toBe(true);
  });

  it('does not report when the address changed', () => {
    expect(shouldReportStall({ before: same, after: 'https://a.test/dashboard', visible: true })).toBe(false);
  });

  it('does not report when the person left the page', () => {
    expect(shouldReportStall({ before: same, after: same, visible: false })).toBe(false);
  });
});

describe('allowStallReport', () => {
  const now = 1_000_000;

  it('allows the first report', () => {
    expect(allowStallReport([], now, 'release_back_arrow')).toBe(true);
  });

  it('blocks the same label inside the minimum gap', () => {
    const history = [{ at: now - (NAV_STALL_MIN_GAP_MS - 1), label: 'release_back_arrow' }];
    expect(allowStallReport(history, now, 'release_back_arrow')).toBe(false);
  });

  it('allows a different label inside that gap', () => {
    const history = [{ at: now - 1000, label: 'release_back_arrow' }];
    expect(allowStallReport(history, now, 'rollout_menu:song')).toBe(true);
  });

  it('blocks everything once the per-minute limit is reached', () => {
    const history = Array.from({ length: NAV_STALL_MAX_PER_MINUTE }, (_, i) => ({
      at: now - 10_000 - i,
      label: `rollout_menu:${i}`,
    }));
    expect(allowStallReport(history, now, 'rollout_menu:other')).toBe(false);
  });

  it('forgets reports older than a minute', () => {
    const history = Array.from({ length: NAV_STALL_MAX_PER_MINUTE }, (_, i) => ({
      at: now - 61_000 - i,
      label: `rollout_menu:${i}`,
    }));
    expect(allowStallReport(history, now, 'release_back_arrow')).toBe(true);
  });
});

describe('describeConnection', () => {
  it('returns nothing when the browser exposes nothing (Safari)', () => {
    expect(describeConnection(undefined)).toEqual({});
    expect(describeConnection(null)).toEqual({});
  });

  it('keeps only fields of the right type', () => {
    expect(
      describeConnection({ effectiveType: '3g', rtt: 450, downlink: 0.7, saveData: true })
    ).toEqual({ effective_type: '3g', rtt_ms: 450, downlink_mbps: 0.7, save_data: true });
    expect(describeConnection({ effectiveType: 3, rtt: 'fast', downlink: NaN, saveData: 'yes' })).toEqual({});
  });
});
