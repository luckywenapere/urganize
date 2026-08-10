'use client';

/**
 * The intake's answer control: a stack of tappable rows wrapping a native
 * radio or checkbox.
 *
 * Ported from the segmented control in the superseded TailorPlanModal, with
 * two changes for a one-question-per-screen flow on a phone. Rows stack
 * full-width instead of wrapping as pills, because a long answer like "The
 * music is mixed and mastered" cannot be a pill at 360px. And the input is a
 * real radio or checkbox inside a label, the way the onboarding wizard does it,
 * so arrow-key groups, screen readers and the 44px hit target all come for
 * free.
 */

type Option<T extends string> = { value: T; label: string };

type SingleProps<T extends string> = {
  name: string;
  legend: string;
  options: Array<Option<T>>;
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
};

const rowClass = (selected: boolean, disabled?: boolean) =>
  [
    'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors',
    selected
      ? 'border-brand bg-brand/8 text-content-primary'
      : 'border-stroke-default bg-bg-elevated text-content-secondary hover:border-stroke-strong hover:bg-bg-hover hover:text-content-primary',
    disabled ? 'cursor-not-allowed opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ');

export function PlannerRadioGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  disabled,
}: SingleProps<T>) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label key={option.value} className={rowClass(selected, disabled)}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              className="h-4 w-4 shrink-0 accent-brand"
            />
            <span className="min-w-0">{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

type MultiProps<T extends string> = {
  legend: string;
  options: Array<Option<T>>;
  value: T[];
  onToggle: (value: T) => void;
  disabled?: boolean;
};

export function PlannerCheckboxGroup<T extends string>({
  legend,
  options,
  value,
  onToggle,
  disabled,
}: MultiProps<T>) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <label key={option.value} className={rowClass(selected, disabled)}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle(option.value)}
              disabled={disabled}
              className="h-4 w-4 shrink-0 accent-brand"
            />
            <span className="min-w-0">{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
