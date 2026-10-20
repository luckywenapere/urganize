import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSettingsEntryMark,
  decideSettingsPopstate,
  markSettingsEntryPushed,
  settingsEntryWasPushed,
  shouldPopSettingsEntry,
} from './settings-history';
import { isEdgeStart, SWIPE_EDGE_GUARD_PX } from './swipe-edge';
import { decideAndroidBack } from '@urganize/native-bridge';

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
    expect(decideAndroidBack(`${base}/dashboard/home?settings=menu`)).toBe('go-back');
    expect(decideAndroidBack(`${base}/dashboard/urgans`)).toBe('go-home');
    expect(decideAndroidBack(`${base}/dashboard/home`)).toBe('exit');
    expect(decideAndroidBack(`${base}/dashboard/home/`)).toBe('exit');
    expect(decideAndroidBack(null)).toBe('exit');
    expect(decideAndroidBack('not a url')).toBe('exit');
  });
});
