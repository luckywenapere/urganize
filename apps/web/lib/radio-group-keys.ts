// Arrow-key behaviour for a `role="radiogroup"` built from buttons.
//
// A radio role is a promise about the keyboard: one Tab stop for the whole
// group, and the arrow keys move the choice (and focus) within it. Buttons with
// `role="radio"` and an onClick keep the role and drop the promise, so every
// option becomes its own Tab stop and the arrows do nothing. Native
// <input type="radio"> keeps it for free and is the first choice; where the
// control is a segmented switch that has to be buttons, this is the other half.
//
// The group also needs a roving tabindex: `tabIndex={selected ? 0 : -1}` on
// each option, so Tab enters the group at the selected one and leaves it.

/** Where an arrow, Home or End key sends the choice, or null for any other
 *  key. Wraps at both ends, as native radio groups do. */
export function nextRadioIndex(key: string, count: number, current: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (current + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * The `onKeyDown` for the radiogroup element. `current` is the index of the
 * selected option and `select` receives the index to choose. Focus follows the
 * choice, and the key is only consumed when it was one of ours.
 */
export function onRadioGroupKeyDown(
  event: {
    key: string;
    currentTarget: HTMLElement;
    preventDefault: () => void;
  },
  current: number,
  select: (index: number) => void
): void {
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const next = nextRadioIndex(event.key, radios.length, current);
  if (next === null) return;
  event.preventDefault();
  select(next);
  radios[next]?.focus();
}
