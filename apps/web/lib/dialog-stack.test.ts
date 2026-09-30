import { describe, expect, it } from 'vitest';
import { createDialogStack } from './dialog-stack';

describe('createDialogStack', () => {
  it('makes the most recently opened dialog the top one', () => {
    const stack = createDialogStack();
    const sheet = stack.open();
    const confirm = stack.open();
    expect(stack.isTop(confirm)).toBe(true);
    expect(stack.isTop(sheet)).toBe(false);
  });

  it('hands ownership back when the top dialog closes', () => {
    const stack = createDialogStack();
    const sheet = stack.open();
    const confirm = stack.open();
    stack.close(confirm);
    expect(stack.isTop(sheet)).toBe(true);
  });

  it('copes with dialogs closing out of order', () => {
    const stack = createDialogStack();
    const a = stack.open();
    const b = stack.open();
    const c = stack.open();
    stack.close(b);
    expect(stack.isTop(c)).toBe(true);
    stack.close(c);
    expect(stack.isTop(a)).toBe(true);
  });

  it('owns nothing once everything is closed, and ignores a repeat close', () => {
    const stack = createDialogStack();
    const only = stack.open();
    stack.close(only);
    stack.close(only);
    expect(stack.isTop(only)).toBe(false);
  });

  it('gives every dialog its own token', () => {
    const stack = createDialogStack();
    expect(stack.open()).not.toBe(stack.open());
  });
});
