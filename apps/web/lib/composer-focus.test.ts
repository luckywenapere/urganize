import { describe, expect, it } from 'vitest';
import { mayAutoFocusComposer } from './composer-focus';

const idle = { activeIsBody: true, activeIsKeyboardProxy: false, activeInMain: false, dialogOpen: false };

describe('mayAutoFocusComposer', () => {
  it('takes focus when nothing else holds it', () => {
    expect(mayAutoFocusComposer(idle)).toBe(true);
  });

  it('takes over from the keyboard proxy, which exists only to be taken over', () => {
    expect(
      mayAutoFocusComposer({ ...idle, activeIsBody: false, activeIsKeyboardProxy: true, activeInMain: false })
    ).toBe(true);
  });

  it('takes over from a link in the top bar the person just used to get here', () => {
    expect(mayAutoFocusComposer({ ...idle, activeIsBody: false, activeInMain: false })).toBe(true);
  });

  it('never takes focus from something the person is using on the page', () => {
    expect(mayAutoFocusComposer({ ...idle, activeIsBody: false, activeInMain: true })).toBe(false);
  });

  it('never takes focus while a dialog is open (the tour, the create modal)', () => {
    expect(mayAutoFocusComposer({ ...idle, dialogOpen: true })).toBe(false);
    expect(mayAutoFocusComposer({ ...idle, activeIsKeyboardProxy: true, dialogOpen: true })).toBe(false);
  });
});
