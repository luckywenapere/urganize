import { describe, expect, it, vi } from 'vitest';
import { registerHomeEditSave, saveHomeEdit } from './edit-save';

describe('saveHomeEdit', () => {
  it('does nothing and says so when no editor is open', () => {
    expect(saveHomeEdit()).toBe(false);
  });

  it('runs the open editor’s save', () => {
    const save = vi.fn();
    const remove = registerHomeEditSave(save);
    expect(saveHomeEdit()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    remove();
  });

  it('stops once the editor closes', () => {
    const save = vi.fn();
    registerHomeEditSave(save)();
    expect(saveHomeEdit()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps a newer editor when an older one closes late', () => {
    const older = vi.fn();
    const newer = vi.fn();
    const removeOlder = registerHomeEditSave(older);
    const removeNewer = registerHomeEditSave(newer);
    removeOlder();
    expect(saveHomeEdit()).toBe(true);
    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
    removeNewer();
  });
});
