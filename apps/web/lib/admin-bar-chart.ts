/**
 * The pure half of components/admin/AdminBarChart.tsx, kept here so vitest
 * (which only collects lib/ and app/) can reach it.
 */

const NICE_STEPS = [1, 2, 5, 10] as const;

/**
 * The top of the y-axis: the smallest 1, 2 or 5 × 10ⁿ at or above `value`,
 * so the axis reads 0 to 5, 0 to 20 or 0 to 500 rather than 0 to 17. Never
 * below 1, so an all-zero chart still has a scale.
 */
export function niceAxisMax(value: number): number {
  if (!Number.isFinite(value) || value <= 1) return 1;

  let magnitude = 1;
  while (magnitude * 10 <= value) magnitude *= 10;

  for (const step of NICE_STEPS) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

/** A bar's height as a percentage of the plot, 0 to 100. Zero draws no bar. */
export function barHeightPercent(value: number, axisMax: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(axisMax) || value <= 0 || axisMax <= 0) return 0;
  return Math.min(100, (value / axisMax) * 100);
}

const CHART_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * Where a key press moves the chart's active bar. `current` null means
 * nothing is picked, which the chart shows as the latest bar, so ArrowLeft
 * from there lands one before the end.
 *
 * Returns undefined for any key the chart does not own, so the caller knows
 * NOT to preventDefault it: Tab, Enter and the up/down arrows belong to the
 * page. Returns null when there is no bar to pick.
 */
export function nextActiveIndex(current: number | null, key: string, length: number): number | null | undefined {
  if (!CHART_KEYS.has(key)) return undefined;
  if (length <= 0) return null;

  const last = length - 1;
  const from = current === null ? last : Math.min(Math.max(current, 0), last);

  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, from - 1);
    case 'ArrowRight':
      return Math.min(last, from + 1);
    case 'Home':
      return 0;
    default:
      return last;
  }
}
