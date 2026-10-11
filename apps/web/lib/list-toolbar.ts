// A list page's search and filters, as data (founder mock, 2026-10-11).
//
// Every list page (Rollouts, People, Directory, Shows, Opportunities, Notes)
// used to stack a full-width search box over a grid of full-width selects. They
// now share one compact toolbar: on a computer it sits in the empty right side
// of the section tab row, and on a phone it is one row, a search box and a
// single Filters button that opens a bottom sheet with the selects in it.
//
// Pure on purpose: the page describes its controls, these rules decide what
// counts as "a filter is set" and how wide the screen has to be before every
// control fits inline, and ListToolbar only draws the result.

export type ToolbarOption = { value: string; label: string };

/** A dropdown. `sort` changes the order, never what is shown, so it never
 *  counts toward the "filters set" badge. */
export type ToolbarSelect = {
  kind: 'filter' | 'sort';
  key: string;
  /** What the control is, read out and shown above it in the sheet. */
  label: string;
  value: string;
  /** The "show everything" value. Defaults to the empty string. */
  defaultValue?: string;
  options: ToolbarOption[];
  onChange: (value: string) => void;
};

/** An on/off filter, such as "Not in touch for 30 days". */
export type ToolbarToggle = {
  kind: 'toggle';
  key: string;
  label: string;
  pressed: boolean;
  onToggle: (pressed: boolean) => void;
};

export type ToolbarControl = ToolbarSelect | ToolbarToggle;

/** True when the control is narrowing the list (sort never is). */
export function isFilterActive(control: ToolbarControl): boolean {
  if (control.kind === 'toggle') return control.pressed;
  if (control.kind === 'sort') return false;
  return control.value !== (control.defaultValue ?? '');
}

/** True when the control differs from its starting value, sort included. Used
 *  to tint a pill so a changed control is visible at a glance. */
export function isChanged(control: ToolbarControl): boolean {
  if (control.kind === 'toggle') return control.pressed;
  return control.value !== (control.defaultValue ?? '');
}

/** The number on the Filters button. Zero draws no badge. */
export function activeFilterCount(controls: readonly ToolbarControl[]): number {
  return controls.filter(isFilterActive).length;
}

/** What the single button that opens the sheet says. */
export function filtersButtonLabel(controls: readonly ToolbarControl[]): string {
  const hasFilter = controls.some((control) => control.kind !== 'sort');
  const hasSort = controls.some((control) => control.kind === 'sort');
  if (hasFilter) return 'Filters';
  if (hasSort) return 'Sort';
  return 'Filters';
}

/**
 * From which width every control is drawn inline on a computer. Below it the
 * controls fold into one Filters button so the tab row never overflows: two
 * pills fit beside the tabs from `xl`, three or more need `2xl`.
 */
export function inlineBreakpoint(controls: readonly ToolbarControl[]): 'lg' | 'xl' | '2xl' {
  if (controls.length <= 1) return 'lg';
  if (controls.length === 2) return 'xl';
  return '2xl';
}

/** The label a pill shows for its current value. */
export function selectedLabel(control: ToolbarSelect): string {
  return control.options.find((option) => option.value === control.value)?.label ?? control.label;
}
