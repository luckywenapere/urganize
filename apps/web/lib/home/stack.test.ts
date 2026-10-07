import { describe, expect, it } from 'vitest';
import { STACK_MAX_PEEKS, stackChipText, stackView } from './stack';

describe('stackView', () => {
  it('draws nothing for an empty group', () => {
    expect(stackView(0, false)).toEqual({ visible: 0, peeks: 0, toggleable: false });
    expect(stackView(0, true)).toEqual({ visible: 0, peeks: 0, toggleable: false });
  });

  it('shows one card with no peeks and no toggle for a single item, open or not', () => {
    expect(stackView(1, false)).toEqual({ visible: 1, peeks: 0, toggleable: false });
    expect(stackView(1, true)).toEqual({ visible: 1, peeks: 0, toggleable: false });
  });

  it('peeks one card behind the top one when two are folded', () => {
    expect(stackView(2, false)).toEqual({ visible: 1, peeks: 1, toggleable: true });
  });

  it('never peeks more than two cards, however many are folded', () => {
    expect(stackView(3, false).peeks).toBe(2);
    expect(stackView(9, false)).toEqual({ visible: 1, peeks: STACK_MAX_PEEKS, toggleable: true });
  });

  it('shows every item and no peeks once open', () => {
    expect(stackView(9, true)).toEqual({ visible: 9, peeks: 0, toggleable: true });
  });

  it('treats a nonsense count as empty', () => {
    expect(stackView(-3, false).visible).toBe(0);
    expect(stackView(Number.NaN, false).visible).toBe(0);
  });
});

describe('stackChipText', () => {
  it('names the group and its count with a middle dot', () => {
    expect(stackChipText('Tasks', 5)).toBe('Tasks · 5');
  });

  it('names the group alone when there is no count', () => {
    expect(stackChipText('Next show', null)).toBe('Next show');
  });

  it('never uses an em dash', () => {
    expect(stackChipText('Tasks', 5)).not.toContain('—');
  });
});
