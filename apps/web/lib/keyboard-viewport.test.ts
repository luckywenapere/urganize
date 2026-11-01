import { describe, expect, it } from 'vitest';
import { isEditableElement } from './keyboard-viewport';

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
