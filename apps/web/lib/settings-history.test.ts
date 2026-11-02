import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSettingsEntryMark,
  decideSettingsPopstate,
  markSettingsEntryPushed,
  settingsEntryWasPushed,
  shouldPopSettingsEntry,
} from './settings-history';
import { isEdgeStart, SWIPE_EDGE_GUARD_PX } from './swipe-edge';
import { decideAndroidBack, SHELL_HOME_PATH } from '@urganize/native-bridge';
import { HOME_PATH } from './home-path';

afterEach(() => clearSettingsEntryMark());

describe('shouldPopSettingsEntry', () => {
  it('pops only when we pushed and the param is still in the URL', () => {
    expect(shouldPopSettingsEntry({ pushedByUs: true, search: '?settings=billing' })).toBe(true);
    expect(shouldPopSettingsEntry({ pushedByUs: false, search: '?settings=billing' })).toBe(false);
    expect(shouldPopSettingsEntry({ pushedByUs: true, search: '' })).toBe(false);
    expect(shouldPopSettingsEntry({ pushedByUs: true, search: '?release=1' })).toBe(false);
  });
});

describe('entry mark', () => {
  it('is set on push and cleared on close', () => {
    expect(settingsEntryWasPushed()).toBe(false);
    markSettingsEntryPushed();
    expect(settingsEntryWasPushed()).toBe(true);
    clearSettingsEntryMark();
    expect(settingsEntryWasPushed()).toBe(false);
  });
});

describe('decideSettingsPopstate', () => {
  it('asks first when edits are unsaved and the param is gone', () => {
    expect(decideSettingsPopstate({ settingsInUrl: false, dirty: true })).toBe('reprompt');
  });
  it('lets a clean pop-up close', () => {
    expect(decideSettingsPopstate({ settingsInUrl: false, dirty: false })).toBe('closed');
  });
  it('ignores a pop that left it open', () => {
    expect(decideSettingsPopstate({ settingsInUrl: true, dirty: true })).toBe('ignore');
  });
});

describe('isEdgeStart', () => {
  it('ignores touches within the edge guard', () => {
    expect(isEdgeStart(0)).toBe(true);
    expect(isEdgeStart(SWIPE_EDGE_GUARD_PX - 1)).toBe(true);
    expect(isEdgeStart(SWIPE_EDGE_GUARD_PX)).toBe(false);
    expect(isEdgeStart(200)).toBe(false);
  });
});

describe('decideAndroidBack', () => {
  const base = 'https://app.urganize.app';
  it('closes settings first, then goes Home, then exits', () => {
    expect(decideAndroidBack(`${base}/dashboard/artists?settings=menu`)).toBe('go-back');
    expect(decideAndroidBack(`${base}/dashboard/urgans`)).toBe('go-home');
    expect(decideAndroidBack(`${base}/dashboard/team`)).toBe('go-home');
    expect(decideAndroidBack(`${base}/dashboard/artists`)).toBe('exit');
    expect(decideAndroidBack(`${base}/dashboard/artists/`)).toBe('exit');
    expect(decideAndroidBack(null)).toBe('exit');
    expect(decideAndroidBack('not a url')).toBe('exit');
  });
});

describe('Android back and the web home path', () => {
  it('the shell and the web app agree on Home', () => {
    expect(SHELL_HOME_PATH).toBe(HOME_PATH);
  });
  it('an unknown or unreadable URL never sends the page to Home', () => {
    expect(decideAndroidBack(undefined)).toBe('exit');
    expect(decideAndroidBack('')).toBe('exit');
  });
});

describe('phone segment entries', () => {
  it('pushes only from the open menu to a segment on a narrow screen', async () => {
    const { shouldPushSegmentEntry } = await import('./settings-history');
    const base = { wasOpen: true, narrow: true, currentRequest: 'menu', targetRequest: 'general' };
    expect(shouldPushSegmentEntry(base)).toBe(true);
    expect(shouldPushSegmentEntry({ ...base, narrow: false })).toBe(false);
    expect(shouldPushSegmentEntry({ ...base, wasOpen: false })).toBe(false);
    expect(shouldPushSegmentEntry({ ...base, currentRequest: 'billing' })).toBe(false);
    expect(shouldPushSegmentEntry({ ...base, targetRequest: 'menu' })).toBe(false);
  });
});

describe('backFromSegment', () => {
  it('goes back to the list only when the list pushed the segment', async () => {
    const { backFromSegment } = await import('./settings-history');
    expect(backFromSegment(1)).toBe('menu');
    expect(backFromSegment(2)).toBe('menu');
  });
  it('closes Settings when the segment was opened straight from the account page', async () => {
    const { backFromSegment } = await import('./settings-history');
    expect(backFromSegment(0)).toBe('close');
  });
});
