/**
 * Credit split maths, in one place (2026-10-09).
 *
 * The Metadata scene shows how collected splits add up, and the distribution
 * check (lib/distribution-rules.ts) warns when they do not. Both used to need
 * the same rounding rule, and one of them lived inside a component, out of reach
 * of the server and of vitest. Moved here so the banner a manager reads in
 * Metadata and the warning the check raises can never disagree about what "adds
 * up to 100" means.
 *
 * Pure: no React, no I/O.
 */

/** What every set of splits has to come to. */
export const SPLIT_TARGET = 100;

/** One decimal place, matching what the public credits form accepts. Legacy rows
 *  stored with two decimals are shown rounded. */
export function roundSplit(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "33", "33.3": no trailing ".0", and no percent sign (so a sentence can put
 *  the sign where it wants it). */
export function formatSplitValue(value: number): string {
  const rounded = roundSplit(value);
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

export function formatPercent(value: number): string {
  return `${formatSplitValue(value)}%`;
}

/** Whether a total misses 100 once rounded to the precision the form accepts.
 *  28.6 + 35.7 + 35.7 floats to 100.00000000000001, which must read as fine. */
export function splitTotalIsOff(total: number): boolean {
  return roundSplit(total) !== SPLIT_TARGET;
}

/** Splits have to add up to 100, so say so in words rather than leaving the
 *  reader to work out what "unclaimed" meant, or why 120% is a problem. */
export function describeSplitTotal(label: string, total: number): string {
  const rounded = roundSplit(total);
  if (rounded === SPLIT_TARGET) return `${label} add up to 100%. Nothing missing.`;
  if (rounded > SPLIT_TARGET) {
    return `${label} add up to ${formatPercent(total)}. That is ${formatPercent(
      total - SPLIT_TARGET
    )} too much. They should total 100%.`;
  }
  return `${label} add up to ${formatPercent(total)}. ${formatPercent(
    SPLIT_TARGET - total
  )} is still missing. They should total 100%.`;
}

/**
 * The total of a list of answers, and whether anybody answered at all. A blank
 * answer is not a zero: a team where nobody has given a split yet has nothing to
 * add up, and calling that "0% of 100" would flag every rollout that has not
 * collected splits.
 */
export function sumSplits(values: ReadonlyArray<number | null | undefined>): {
  total: number;
  answered: boolean;
} {
  let total = 0;
  let answered = false;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    answered = true;
    total += value;
  }
  return { total, answered };
}
