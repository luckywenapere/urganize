/**
 * The stacked groups on Home (2026-10-07, founder call): a group's first item
 * shows in full and the next ones peek out behind it as card edges, like a pile
 * of notifications on a phone. A chip on the stack names the group and opens it.
 *
 * Pure so the folding rules can be tested; components/home/HomeStack.tsx only
 * draws what this returns.
 */

/** At most this many card edges peek out behind the top card. */
export const STACK_MAX_PEEKS = 2;

export type StackView = {
  /** How many items are drawn in full. */
  visible: number;
  /** How many card edges peek out behind the top card. */
  peeks: 0 | 1 | 2;
  /** Whether the chip opens and closes the group. A single item has nothing to open. */
  toggleable: boolean;
};

export function stackView(count: number, open: boolean): StackView {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (total === 0) return { visible: 0, peeks: 0, toggleable: false };
  if (total === 1) return { visible: 1, peeks: 0, toggleable: false };
  if (open) return { visible: total, peeks: 0, toggleable: true };
  return { visible: 1, peeks: Math.min(STACK_MAX_PEEKS, total - 1) as 1 | 2, toggleable: true };
}

/** The words on the chip: "Tasks · 5", or just the name when there is no count. */
export function stackChipText(label: string, count: number | null): string {
  return count === null ? label : `${label} · ${count}`;
}
