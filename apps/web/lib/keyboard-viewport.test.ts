import { describe, expect, it } from 'vitest';
import { isEditableElement, keyboardCanExist } from './keyboard-viewport';

describe('keyboardCanExist', () => {
  it('is true on a touch screen at normal zoom', () => {
    expect(keyboardCanExist({ coarsePointer: true, scale: 1 })).toBe(true);
  });

  it('is false on a mouse or trackpad computer, which has no on-screen keyboard', () => {
    // A desktop window can read as "covered" (a zoomed page, a toolbar, a
    // resized window). Reading that as a keyboard shifted the whole app, top
    // bar included, down the screen.
    expect(keyboardCanExist({ coarsePointer: false, scale: 1 })).toBe(false);
  });

  it('is false while the page is pinched in, even on a phone', () => {
    // Pinch-zoom shrinks the visible area and pans it. That is not a keyboard.
    expect(keyboardCanExist({ coarsePointer: true, scale: 1.4 })).toBe(false);
    expect(keyboardCanExist({ coarsePointer: false, scale: 1.4 })).toBe(false);
  });

  it('allows a hair of rounding in the scale', () => {
    expect(keyboardCanExist({ coarsePointer: true, scale: 1.005 })).toBe(true);
    expect(keyboardCanExist({ coarsePointer: true, scale: 0.999 })).toBe(true);
  });
});

describe('isEditableElement', () => {
  it('is true for fields that raise the keyboard', () => {
    expect(isEditableElement({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableElement({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isEditableElement({ tagName: 'INPUT', type: 'email' })).toBe(true);
    expect(isEditableElement({ tagName: 'input' })).toBe(true);
    expect(isEditableElement({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is false when nothing is focused or the focus cannot raise a keyboard', () => {
    expect(isEditableElement(null)).toBe(false);
    expect(isEditableElement(undefined)).toBe(false);
    expect(isEditableElement({ tagName: 'BODY' })).toBe(false);
    expect(isEditableElement({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableElement({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isEditableElement({ tagName: 'INPUT', type: 'submit' })).toBe(false);
    expect(isEditableElement({ tagName: 'DIV', isContentEditable: false })).toBe(false);
  });
});
