import { describe, expect, it } from 'vitest';
import { decideSettingsClose, hasUnsavedEdits, saveButtonVisible, withDirtyKey } from './settings-dirty';

describe('withDirtyKey', () => {
  it('marks a field as edited', () => {
    expect(withDirtyKey({}, 'profile.name', true)).toEqual({ 'profile.name': true });
  });

  it('clears it again once it is saved or put back', () => {
    const marked = withDirtyKey({}, 'profile.name', true);
    expect(withDirtyKey(marked, 'profile.name', false)).toEqual({});
  });

  it('keeps other fields as they were', () => {
    const marked = withDirtyKey({ a: true }, 'b', true);
    expect(marked).toEqual({ a: true, b: true });
    expect(withDirtyKey(marked, 'a', false)).toEqual({ b: true });
  });

  it('hands back the same object when nothing changed, so a store can skip a render', () => {
    const marked = { a: true } as const;
    expect(withDirtyKey(marked, 'a', true)).toBe(marked);
    const empty = {};
    expect(withDirtyKey(empty, 'a', false)).toBe(empty);
  });

  it('never mutates what it was given', () => {
    const marked = Object.freeze({ a: true as const });
    expect(() => withDirtyKey(marked, 'b', true)).not.toThrow();
    expect(() => withDirtyKey(marked, 'a', false)).not.toThrow();
  });
});

describe('hasUnsavedEdits', () => {
  it('is false when nothing is marked', () => {
    expect(hasUnsavedEdits({})).toBe(false);
  });

  it('is true as soon as one field is', () => {
    expect(hasUnsavedEdits({ 'brief.bio': true })).toBe(true);
  });
});

describe('decideSettingsClose', () => {
  it('closes straight away when there is nothing to lose', () => {
    expect(decideSettingsClose({})).toBe('close');
  });

  it('asks first when a text field was edited and not saved', () => {
    expect(decideSettingsClose({ 'profile.name': true })).toBe('confirm');
  });

  it('stops asking once every edit is saved', () => {
    const saved = withDirtyKey(withDirtyKey({}, 'profile.name', true), 'profile.name', false);
    expect(decideSettingsClose(saved)).toBe('close');
  });

  it('still asks when the unsaved edit is in a segment that is no longer showing', () => {
    // Switching segment keeps drafts until close, so the guard has to remember
    // a field its section is no longer on screen for.
    const dirty = withDirtyKey({}, 'brief.section', true);
    expect(decideSettingsClose(dirty)).toBe('confirm');
  });
});

describe('saveButtonVisible', () => {
  it('is hidden on a field nobody has touched', () => {
    expect(saveButtonVisible({ dirty: false, saving: false })).toBe(false);
  });

  it('appears once the field is edited', () => {
    expect(saveButtonVisible({ dirty: true, saving: false })).toBe(true);
  });

  it('stays while the save is in flight, even though the field now matches what is stored', () => {
    expect(saveButtonVisible({ dirty: false, saving: true })).toBe(true);
  });

  it('is the same fact as the discard prompt: a visible Save means closing asks first', () => {
    const marked = withDirtyKey({}, 'profile.name', true);
    expect(saveButtonVisible({ dirty: true, saving: false })).toBe(decideSettingsClose(marked) === 'confirm');
    expect(saveButtonVisible({ dirty: false, saving: false })).toBe(decideSettingsClose({}) === 'confirm');
  });
});
