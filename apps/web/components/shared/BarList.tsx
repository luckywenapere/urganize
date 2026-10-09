export type BarListRow = { key: string; label: string; value: number };

const defaultFormatValue = (value: number): string => new Intl.NumberFormat('en').format(value);

/**
 * A labelled list of single-colour bars: one hue, the bar's length carries the
 * number, and every value is written out beside it, so nothing depends on
 * colour. Shared by the usage dashboard (/admin/metrics) and Home's "Where the
 * money went" card, which is why the value and the share are formatted by the
 * caller: counts on one, naira on the other.
 *
 * Display only. A row with no value draws no bar at all, and a non-zero one is
 * never thinner than a 4px sliver so it stays visible.
 */
export function BarList({
  rows,
  label,
  formatValue = defaultFormatValue,
  formatShare,
}: {
  rows: BarListRow[];
  /** What the list is, for assistive technology. */
  label: string;
  /** How a row's value is written. Defaults to a plain number with commas. */
  formatValue?: (value: number) => string;
  /** When given, each row also shows its share of the total, written by this. */
  formatShare?: (fraction: number) => string;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <ul aria-label={label} className="space-y-2.5">
      {rows.map((row) => {
        const width = max > 0 ? (row.value / max) * 100 : 0;
        return (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-content-primary">{row.label}</span>
              <span className="shrink-0 tabular-nums text-content-secondary">
                {formatValue(row.value)}
                {formatShare && total > 0 ? ` · ${formatShare(row.value / total)}` : ''}
              </span>
            </div>
            <div aria-hidden="true" className="mt-1 h-1.5 rounded-full bg-stroke-strong">
              {row.value > 0 ? (
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `max(4px, ${width}%)` }} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
