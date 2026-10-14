import { describe, expect, it } from 'vitest';
import {
  NAV_RECOVER_MIN_GAP_MS,
  NAV_RECOVER_MS,
  isDuplicateNavClick,
  routerJustReceived,
  NAV_STALL_MAX_PER_MINUTE,
  NAV_STALL_MIN_GAP_MS,
  allowRecovery,
  allowStallReport,
  describeConnection,
  didNavigate,
  linkClickTarget,
  resolveRecoverTarget,
  sceneRowTarget,
  shouldRecover,
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

describe('resolveRecoverTarget', () => {
  const here = 'https://app.urganize.app/dashboard?release=1';

  it('keeps a same-origin path, query and hash', () => {
    expect(resolveRecoverTarget('/dashboard?x=1#a', here)).toBe('/dashboard?x=1#a');
    expect(resolveRecoverTarget('https://app.urganize.app/settings', here)).toBe('/settings');
  });

  it('refuses another site', () => {
    expect(resolveRecoverTarget('https://evil.test/dashboard', here)).toBeNull();
    expect(resolveRecoverTarget('//evil.test/x', here)).toBeNull();
  });

  it('refuses schemes that are not web pages', () => {
    expect(resolveRecoverTarget('javascript:alert(1)', here)).toBeNull();
    expect(resolveRecoverTarget('mailto:a@b.test', here)).toBeNull();
  });

  it('refuses garbage', () => {
    expect(resolveRecoverTarget('http://[::', here)).toBeNull();
  });
});

describe('shouldRecover', () => {
  const stuck = 'https://a.test/dashboard?release=1';
  const base = { before: stuck, after: stuck, target: '/dashboard', visible: true, online: true };

  it('recovers when nothing landed and the target is elsewhere', () => {
    expect(shouldRecover(base)).toBe(true);
  });

  it('does not recover when the navigation landed', () => {
    expect(shouldRecover({ ...base, after: 'https://a.test/dashboard' })).toBe(false);
  });

  it('does not recover when the person left the page', () => {
    expect(shouldRecover({ ...base, visible: false })).toBe(false);
  });

  it('does not recover when offline, where a page load cannot work either', () => {
    expect(shouldRecover({ ...base, online: false })).toBe(false);
  });

  it('does not recover when the target is where the page already is', () => {
    expect(shouldRecover({ ...base, target: '/dashboard?release=1' })).toBe(false);
  });

  it('does not recover when the page moved somewhere else on its own', () => {
    expect(shouldRecover({ ...base, after: 'https://a.test/settings' })).toBe(false);
  });
});

describe('allowRecovery', () => {
  it('allows the first recovery', () => {
    expect(allowRecovery(null, 1000)).toBe(true);
  });

  it('blocks a second one inside the gap, so a failing destination cannot loop', () => {
    expect(allowRecovery(1000, 1000 + NAV_RECOVER_MIN_GAP_MS - 1)).toBe(false);
  });

  it('allows one after the gap', () => {
    expect(allowRecovery(1000, 1000 + NAV_RECOVER_MIN_GAP_MS)).toBe(true);
  });
});

describe('linkClickTarget', () => {
  const click = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    href: '/dashboard',
    target: null,
    hasDownload: false,
    currentHref: 'https://a.test/dashboard/shows',
  };

  it('returns the destination of a plain left click', () => {
    expect(linkClickTarget(click)).toBe('/dashboard');
  });

  it('ignores other mouse buttons and modified clicks', () => {
    expect(linkClickTarget({ ...click, button: 1 })).toBeNull();
    expect(linkClickTarget({ ...click, metaKey: true })).toBeNull();
    expect(linkClickTarget({ ...click, ctrlKey: true })).toBeNull();
    expect(linkClickTarget({ ...click, shiftKey: true })).toBeNull();
    expect(linkClickTarget({ ...click, altKey: true })).toBeNull();
  });

  it('ignores links that open elsewhere or download', () => {
    expect(linkClickTarget({ ...click, target: '_blank' })).toBeNull();
    expect(linkClickTarget({ ...click, hasDownload: true })).toBeNull();
  });

  it('treats _self as a normal link', () => {
    expect(linkClickTarget({ ...click, target: '_self' })).toBe('/dashboard');
  });

  it('ignores another site and a missing href', () => {
    expect(linkClickTarget({ ...click, href: 'https://other.test/' })).toBeNull();
    expect(linkClickTarget({ ...click, href: null })).toBeNull();
  });
});

describe('sceneRowTarget', () => {
  const release = 'https://a.test/dashboard?release=abc&calendar=9';

  it('opens a scene that is not lit', () => {
    expect(sceneRowTarget(release, 'metadata', false)).toBe(
      '/dashboard?release=abc&calendar=9&scene=metadata'
    );
  });

  it('closes a lit scene', () => {
    expect(sceneRowTarget(`${release}&scene=metadata`, 'metadata', true)).toBe(
      '/dashboard?release=abc&calendar=9'
    );
  });

  it('treats the main view as no scene', () => {
    expect(sceneRowTarget(`${release}&scene=song`, 'activities', false)).toBe(
      '/dashboard?release=abc&calendar=9'
    );
  });

  it('gives nothing off a release page, where there is nothing sensible to load', () => {
    expect(sceneRowTarget('https://a.test/dashboard', 'metadata', false)).toBeNull();
  });
});

describe('isDuplicateNavClick (double tap while loading)', () => {
  const before = 'https://a.test/dashboard/home';
  const pending = { target: '/dashboard/catalogue', before, at: 1000 };

  it('is true for the same link tapped again while the first is loading', () => {
    expect(isDuplicateNavClick(pending, '/dashboard/catalogue', before, 1800)).toBe(true);
  });

  it('is false with nothing pending', () => {
    expect(isDuplicateNavClick(null, '/dashboard/catalogue', before, 1800)).toBe(false);
  });

  it('is false for a different link: that is a change of mind, not a repeat', () => {
    expect(isDuplicateNavClick(pending, '/dashboard/pitching', before, 1800)).toBe(false);
  });

  it('is false once the first tap has landed', () => {
    expect(
      isDuplicateNavClick(pending, '/dashboard/catalogue', 'https://a.test/dashboard/catalogue', 1800)
    ).toBe(false);
  });

  it('is false once the first tap is old enough that recovery has had its turn', () => {
    expect(isDuplicateNavClick(pending, '/dashboard/catalogue', before, 1000 + NAV_RECOVER_MS)).toBe(false);
  });

  it('ignores the hash when comparing targets', () => {
    expect(isDuplicateNavClick(pending, '/dashboard/catalogue#top', before, 1800)).toBe(true);
  });
});

describe('routerJustReceived (slow but alive)', () => {
  it('is true when the target RSC payload arrived inside the window', () => {
    const entries = [{ name: 'https://a.test/dashboard/catalogue?_rsc=abc', responseEnd: 9000 }];
    expect(routerJustReceived(entries, '/dashboard/catalogue', 10_000)).toBe(true);
  });

  it('keeps the rest of the query in the comparison', () => {
    const entries = [{ name: 'https://a.test/dashboard?release=1&_rsc=abc', responseEnd: 9000 }];
    expect(routerJustReceived(entries, '/dashboard?release=1', 10_000)).toBe(true);
    expect(routerJustReceived(entries, '/dashboard?release=2', 10_000)).toBe(false);
  });

  it('is false for an old payload or a plain asset', () => {
    expect(
      routerJustReceived([{ name: 'https://a.test/dashboard/catalogue?_rsc=abc', responseEnd: 1000 }], '/dashboard/catalogue', 10_000)
    ).toBe(false);
    expect(
      routerJustReceived([{ name: 'https://a.test/dashboard/catalogue', responseEnd: 9900 }], '/dashboard/catalogue', 10_000)
    ).toBe(false);
  });
});
