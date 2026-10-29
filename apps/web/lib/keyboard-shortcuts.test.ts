import { describe, expect, it } from 'vitest';
import { GO_SEQUENCE_MS, decideGoKey, goHintForArea, isBareKey } from './keyboard-shortcuts';

const press = (key: string, over: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...over,
});
const AREAS = ['catalogue', 'urgans', 'team', 'relationships', 'opportunities'];

describe('isBareKey', () => {
  it('treats ⌘C, Ctrl+C and Alt+C as not bare, so copy keeps working', () => {
    expect(isBareKey(press('c'))).toBe(true);
    expect(isBareKey(press('c', { metaKey: true }))).toBe(false);
    expect(isBareKey(press('c', { ctrlKey: true }))).toBe(false);
    expect(isBareKey(press('c', { altKey: true }))).toBe(false);
  });
});

describe('decideGoKey', () => {
  it('starts on G and goes on the second key', () => {
    expect(decideGoKey(press('g'), null, 0, AREAS)).toEqual({ kind: 'start' });
    expect(decideGoKey(press('t'), 0, 300, AREAS)).toEqual({ kind: 'go', area: 'team' });
    expect(decideGoKey(press('C'), 0, 300, AREAS)).toEqual({ kind: 'go', area: 'catalogue' });
  });

  it('cancels when the second key is too late or unknown', () => {
    expect(decideGoKey(press('h'), 0, GO_SEQUENCE_MS + 1, AREAS)).toEqual({ kind: 'cancel' });
    expect(decideGoKey(press('x'), 0, 100, AREAS)).toEqual({ kind: 'cancel' });
  });

  it('cancels for an area this person cannot see', () => {
    expect(decideGoKey(press('a'), 0, 100, AREAS)).toEqual({ kind: 'cancel' });
  });

  it('ignores keys with ⌘ or Ctrl, and plain keys with nothing pending', () => {
    expect(decideGoKey(press('g', { metaKey: true }), null, 0, AREAS)).toEqual({ kind: 'ignore' });
    expect(decideGoKey(press('h'), null, 0, AREAS)).toEqual({ kind: 'ignore' });
  });
});

describe('goHintForArea', () => {
  it('names the keys for each area', () => {
    expect(goHintForArea('team')).toBe('G T');
    expect(goHintForArea('home')).toBeNull();
    expect(goHintForArea('urgans')).toBe('G U');
    expect(goHintForArea('settings')).toBeNull();
  });
});
