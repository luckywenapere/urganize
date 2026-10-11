import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  filtersButtonLabel,
  inlineBreakpoint,
  isChanged,
  isFilterActive,
  selectedLabel,
  type ToolbarControl,
  type ToolbarSelect,
} from './list-toolbar';

const noop = () => {};

function select(over: Partial<ToolbarSelect> & { key: string }): ToolbarSelect {
  return {
    kind: 'filter',
    label: 'Role',
    value: '',
    options: [
      { value: '', label: 'Any role' },
      { value: 'producer', label: 'Producer' },
    ],
    onChange: noop,
    ...over,
  };
}

const toggle = (pressed: boolean): ToolbarControl => ({
  kind: 'toggle',
  key: 'stale',
  label: 'Not in touch',
  pressed,
  onToggle: noop,
});

describe('isFilterActive', () => {
  it('counts a select only when it is off its default', () => {
    expect(isFilterActive(select({ key: 'role' }))).toBe(false);
    expect(isFilterActive(select({ key: 'role', value: 'producer' }))).toBe(true);
  });

  it('honours a non-empty default, like Opportunities opening on Open', () => {
    expect(isFilterActive(select({ key: 'state', value: 'open', defaultValue: 'open' }))).toBe(false);
    expect(isFilterActive(select({ key: 'state', value: 'all', defaultValue: 'open' }))).toBe(true);
  });

  it('never counts a sort, because a sort hides nothing', () => {
    expect(isFilterActive(select({ key: 'sort', kind: 'sort', value: 'name', defaultValue: 'recent' }))).toBe(false);
    expect(isChanged(select({ key: 'sort', kind: 'sort', value: 'name', defaultValue: 'recent' }))).toBe(true);
  });

  it('counts a toggle when it is pressed', () => {
    expect(isFilterActive(toggle(false))).toBe(false);
    expect(isFilterActive(toggle(true))).toBe(true);
  });
});

describe('activeFilterCount', () => {
  it('adds up the filters that are set and ignores sort', () => {
    expect(
      activeFilterCount([
        select({ key: 'role', value: 'producer' }),
        select({ key: 'city', value: '' }),
        select({ key: 'sort', kind: 'sort', value: 'name', defaultValue: 'recent' }),
        toggle(true),
      ])
    ).toBe(2);
    expect(activeFilterCount([])).toBe(0);
  });
});

describe('filtersButtonLabel', () => {
  it('says Sort when the only control is a sort', () => {
    expect(filtersButtonLabel([select({ key: 'sort', kind: 'sort' })])).toBe('Sort');
  });
  it('says Filters whenever there is a filter', () => {
    expect(filtersButtonLabel([select({ key: 'role' }), select({ key: 'sort', kind: 'sort' })])).toBe('Filters');
  });
});

describe('inlineBreakpoint', () => {
  it('fits more controls inline only on wider screens', () => {
    expect(inlineBreakpoint([select({ key: 'a' })])).toBe('lg');
    expect(inlineBreakpoint([select({ key: 'a' }), select({ key: 'b' })])).toBe('xl');
    expect(inlineBreakpoint([select({ key: 'a' }), select({ key: 'b' }), toggle(false)])).toBe('2xl');
  });
});

describe('selectedLabel', () => {
  it('shows the chosen option, falling back to the control name', () => {
    expect(selectedLabel(select({ key: 'role', value: 'producer' }))).toBe('Producer');
    expect(selectedLabel(select({ key: 'role', value: 'gone' }))).toBe('Role');
  });
});
