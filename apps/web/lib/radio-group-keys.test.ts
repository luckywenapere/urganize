import { describe, expect, it } from 'vitest';
import { nextRadioIndex, onRadioGroupKeyDown } from './radio-group-keys';

describe('nextRadioIndex', () => {
  it('moves forward with Right and Down, wrapping at the end', () => {
    expect(nextRadioIndex('ArrowRight', 3, 0)).toBe(1);
    expect(nextRadioIndex('ArrowDown', 3, 1)).toBe(2);
    expect(nextRadioIndex('ArrowRight', 3, 2)).toBe(0);
  });

  it('moves back with Left and Up, wrapping at the start', () => {
    expect(nextRadioIndex('ArrowLeft', 3, 2)).toBe(1);
    expect(nextRadioIndex('ArrowUp', 3, 0)).toBe(2);
  });

  it('jumps to the ends with Home and End', () => {
    expect(nextRadioIndex('Home', 4, 2)).toBe(0);
    expect(nextRadioIndex('End', 4, 1)).toBe(3);
  });

  it('ignores every other key and an empty group', () => {
    expect(nextRadioIndex('Tab', 3, 0)).toBeNull();
    expect(nextRadioIndex('Enter', 3, 0)).toBeNull();
    expect(nextRadioIndex('a', 3, 0)).toBeNull();
    expect(nextRadioIndex('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('onRadioGroupKeyDown', () => {
  function fakeGroup(count: number) {
    const focused: number[] = [];
    const radios = Array.from({ length: count }, (_, index) => ({ focus: () => focused.push(index) }));
    const currentTarget = { querySelectorAll: () => radios } as unknown as HTMLElement;
    return { focused, currentTarget };
  }

  it('selects the next option, moves focus to it and consumes the key', () => {
    const { focused, currentTarget } = fakeGroup(3);
    const chosen: number[] = [];
    let prevented = false;
    onRadioGroupKeyDown(
      { key: 'ArrowRight', currentTarget, preventDefault: () => (prevented = true) },
      0,
      (index) => chosen.push(index)
    );
    expect(chosen).toEqual([1]);
    expect(focused).toEqual([1]);
    expect(prevented).toBe(true);
  });

  it('leaves other keys alone so Tab still leaves the group', () => {
    const { focused, currentTarget } = fakeGroup(3);
    const chosen: number[] = [];
    let prevented = false;
    onRadioGroupKeyDown(
      { key: 'Tab', currentTarget, preventDefault: () => (prevented = true) },
      0,
      (index) => chosen.push(index)
    );
    expect(chosen).toEqual([]);
    expect(focused).toEqual([]);
    expect(prevented).toBe(false);
  });
});
