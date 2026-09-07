import type { ReactNode } from 'react';

/**
 * A row of stat tiles — one number, one label, an optional context line.
 *
 * Borrowed from the AI-native insight-card pattern (research pass,
 * 2026-08-13): a headline number paired with a smaller secondary line reads
 * far faster than a sentence carrying the same figures, and it lets a reader
 * CHECK a generated paragraph against the data it was written from. That
 * verification job is the whole reason this exists.
 *
 * Deliberately app design language (theme tokens, font-display values,
 * font-mono labels), NOT the recap poster's typography: the poster is a
 * separate, dark-locked artifact with its own deliberate treatment (see
 * lib/recap-card.tsx, whose own comment asks it to read "as a designed
 * poster, not a stats dashboard"). This is in-app chrome; the two must not
 * borrow each other's voice.
 *
 * Layout is flex-wrap with equal-growing tiles rather than a fixed grid, so
 * two, three, four or five tiles all fill their row without count-specific
 * column classes or a stranded orphan on the last line.
 */

export type StatTile = {
  /** Stable key — also the React key, so it must be unique in the row. */
  key: string;
  /** The headline figure, pre-formatted (this component never formats). */
  value: string;
  label: string;
  /** Small line under the value: "of 64", "this week". The insight-card
   * pattern's secondary-metric slot, which is what makes a bare count
   * meaningful without a sentence around it. */
  detail?: string;
  /**
   * `alert` tints the value with status-error. Reserved for a figure that is
   * genuinely bad news at a glance (blocked work), never for emphasis — a row
   * where several tiles shout has no hierarchy left.
   */
  tone?: 'default' | 'alert';
};

export function StatTiles({
  tiles,
  ariaLabel,
}: {
  tiles: StatTile[];
  /** Names the group for screen readers, e.g. "Release progress". */
  ariaLabel: string;
}): ReactNode {
  if (tiles.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className="min-w-[7.5rem] flex-1 border border-stroke-default bg-bg-elevated/50 px-3 py-2.5"
        >
          <p
            className={`font-display text-2xl font-semibold leading-none ${
              tile.tone === 'alert' ? 'text-status-error' : 'text-content-primary'
            }`}
          >
            {tile.value}
          </p>
          <p className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-content-tertiary">
            {tile.label}
          </p>
          {tile.detail ? (
            <p className="mt-0.5 font-mono text-[10px] text-content-tertiary/80">{tile.detail}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
