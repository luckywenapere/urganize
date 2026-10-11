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
 *
 * THE WHOLE ROW IS THE TARGET (2026-10-11, after a first-session replay). The
 * label is a full-width block at least 52px tall, `touch-manipulation` so a
 * quick second tap is a tap and not a zoom, and its children ignore the
 * pointer so a tap on the words or the dot lands on the label itself. The
 * selected row also got its fill back: it used `bg-brand/8`, which is off
 * Tailwind's opacity scale and generated no rule (the Button's danger variant
 * records the same trap), so the only sign of a choice was a thin border.
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
    'flex min-h-[52px] w-full cursor-pointer touch-manipulation select-none items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors',
    selected
      ? 'border-brand bg-brand/10 text-content-primary'
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
              className="pointer-events-none h-4 w-4 shrink-0 accent-brand"
            />
            <span className="pointer-events-none min-w-0 flex-1">{option.label}</span>
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
              className="pointer-events-none h-4 w-4 shrink-0 accent-brand"
            />
            <span className="pointer-events-none min-w-0 flex-1">{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
