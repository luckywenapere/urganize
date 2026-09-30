import { describe, expect, it } from 'vitest';
import { nextTabTarget } from './dialog-focus';

const els = ['a', 'b', 'c'];
const inDialog = (e: string | null) => e !== null && els.includes(e);

describe('nextTabTarget', () => {
  it('wraps forward from the last control to the first', () => {
    expect(nextTabTarget(els, 'c', false, inDialog)).toBe('a');
  });

  it('wraps backward from the first control to the last', () => {
    expect(nextTabTarget(els, 'a', true, inDialog)).toBe('c');
  });

  it('lets the browser move focus in the middle of the dialog', () => {
    expect(nextTabTarget(els, 'b', false, inDialog)).toBeNull();
    expect(nextTabTarget(els, 'b', true, inDialog)).toBeNull();
  });

  it('pulls focus back in when it is outside the dialog', () => {
    expect(nextTabTarget(els, 'page-link', false, inDialog)).toBe('a');
    expect(nextTabTarget(els, 'page-link', true, inDialog)).toBe('c');
    expect(nextTabTarget(els, null, false, inDialog)).toBe('a');
  });

  it('does nothing when the dialog has nothing to focus', () => {
    expect(nextTabTarget([], null, false, inDialog)).toBeNull();
  });
});

import { DIALOG_FOCUSABLE } from './dialog-focus';

describe('DIALOG_FOCUSABLE', () => {
  it('excludes controls that are deliberately out of the Tab order', () => {
    // Every clause must carry the tabindex exclusion, or a backdrop close
    // button (tabindex="-1") would count as the dialog's first or last stop.
    for (const clause of DIALOG_FOCUSABLE.split(', ')) {
      expect(clause).toContain(':not([tabindex="-1"])');
    }
  });

  it('still lists the controls a dialog is made of', () => {
    for (const tag of ['a[href]', 'button', 'input', 'select', 'textarea']) {
      expect(DIALOG_FOCUSABLE).toContain(tag);
    }
  });
});
