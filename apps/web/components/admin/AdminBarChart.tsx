'use client';

import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { barHeightPercent, nextActiveIndex, niceAxisMax } from '@/lib/admin-bar-chart';

// One bar chart for the admin hub, first used by the Growth page for both its
// monthly accounts and its weekly waitlist so the two read as one system.
// Plain CSS bars, no chart library (the boring-stack call the Growth page has
// made since 2026-07-30).
//
// Follows the dataviz rules rather than the chart it replaced:
//   - One series, so no legend: the section heading names what is plotted.
//   - Bars at most 24px wide, centred in their slot, 4px rounded top, square
//     at the baseline, with a 2px gap between slots.
//   - No number on every bar. A readout line above the plot carries the
//     active bar, and defaults to the latest one, so the newest value is
//     always labelled. The y-axis shows 0 and a rounded top; the table under
//     each chart carries every value, so nothing depends on hovering.
//   - Hover, tap and the keyboard all move the same readout. The plot is ONE
//     tab stop: arrow keys, Home and End move between bars.
//   - Text never wears the series colour.

export type AdminBar = {
  key: string;
  /** Short label under the bar, e.g. "Sep" or "W38". */
  tick: string;
  /** Full label for the readout, e.g. "Sep 2026, so far". */
  label: string;
  value: number;
};

type AdminBarChartProps = {
  /** Names the series for assistive tech. */
  title: string;
  bars: AdminBar[];
  /** The readout's lead, e.g. `4 new accounts`. */
  formatValue: (value: number) => string;
};

const axisNumber = new Intl.NumberFormat('en');

export function AdminBarChart({ title, bars, formatValue }: AdminBarChartProps) {
  const readoutId = useId();
  // null means "nothing picked", which shows the latest bar.
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);

  if (bars.length === 0) return null;

  const latest = bars.length - 1;
  const activeIndex = active === null ? latest : Math.min(Math.max(active, 0), latest);
  const activeBar = bars[activeIndex];
  const axisMax = niceAxisMax(Math.max(0, ...bars.map((bar) => bar.value)));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextActiveIndex(active, event.key, bars.length);
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    // A mouse leaving the plot hands the readout back to the latest bar. A
    // finger lifting fires pointerleave too, so a tap keeps its bar until the
    // next tap or until the chart loses focus.
    if (event.pointerType === 'mouse') setActive(null);
  };

  return (
    <div className="mt-6 rounded-lg border border-stroke-default bg-bg-surface p-5">
      <p
        id={readoutId}
        aria-live={focused ? 'polite' : 'off'}
        className="min-h-[20px] text-sm text-content-primary"
      >
        <span className="font-semibold">{formatValue(activeBar.value)}</span>
        <span className="text-content-tertiary"> · {activeBar.label}</span>
      </p>

      <div
        role="group"
        aria-label={title}
        aria-describedby={readoutId}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setActive(null);
        }}
        onPointerLeave={handlePointerLeave}
        className="motion-focus mt-3 flex gap-2 rounded-md"
      >
        <div
          aria-hidden="true"
          className="flex h-40 w-8 shrink-0 flex-col justify-between text-right font-mono text-[10px] leading-3 tabular-nums text-content-tertiary"
        >
          <span className="-translate-y-1/2">{axisNumber.format(axisMax)}</span>
          <span className="translate-y-1/2">0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative flex h-40 items-end gap-0.5 border-b border-stroke-strong">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-stroke-default" />
            {bars.map((bar, index) => {
              const isActive = index === activeIndex;
              const height = barHeightPercent(bar.value, axisMax);
              return (
                <div
                  key={bar.key}
                  aria-hidden="true"
                  onPointerEnter={() => setActive(index)}
                  onPointerDown={() => setActive(index)}
                  className={`relative flex h-full min-w-0 flex-1 items-end justify-center rounded-t-sm transition-colors ${
                    isActive ? 'bg-bg-hover' : ''
                  }`}
                >
                  {height > 0 ? (
                    <div
                      className={`w-full max-w-[24px] rounded-t-sm transition-colors ${
                        isActive ? 'bg-brand' : 'bg-brand/80'
                      }`}
                      // A non-zero value always shows at least 2px, so it never
                      // reads as the empty baseline of a zero.
                      style={{ height: `max(2px, ${height}%)` }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div aria-hidden="true" className="mt-2 flex h-3 gap-0.5">
            {bars.map((bar, index) => (
              <span
                key={bar.key}
                className={`min-w-0 flex-1 truncate text-center font-mono text-[9px] uppercase leading-3 ${
                  index === activeIndex ? 'text-content-primary' : 'text-content-tertiary'
                }`}
              >
                {bar.tick}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
