import { describe, expect, it } from 'vitest';
import { barHeightPercent, nextActiveIndex, niceAxisMax } from './admin-bar-chart';

/**
 * The pure half of the admin bar chart: the axis top the bars are scaled to,
 * how tall each bar is, and which bar the arrow keys move to.
 */

describe('niceAxisMax', () => {
  it('rounds up to the next 1, 2 or 5 step', () => {
    const cases: Array<[number, number]> = [
      [1, 1],
      [2, 2],
      [3, 5],
      [5, 5],
      [6, 10],
      [10, 10],
      [11, 20],
      [48, 50],
      [101, 200],
      [480, 500],
      [501, 1000],
      [1234, 2000],
    ];
    for (const [value, expected] of cases) {
      expect(niceAxisMax(value)).toBe(expected);
    }
  });

  it('never goes below 1, so an empty chart still has a scale', () => {
    expect(niceAxisMax(0)).toBe(1);
    expect(niceAxisMax(0.4)).toBe(1);
    expect(niceAxisMax(-3)).toBe(1);
    expect(niceAxisMax(Number.NaN)).toBe(1);
    expect(niceAxisMax(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('barHeightPercent', () => {
  it('scales a value against the axis top', () => {
    expect(barHeightPercent(5, 10)).toBe(50);
    expect(barHeightPercent(10, 10)).toBe(100);
  });

  it('draws nothing for zero, a negative, or a broken value', () => {
    expect(barHeightPercent(0, 10)).toBe(0);
    expect(barHeightPercent(-2, 10)).toBe(0);
    expect(barHeightPercent(Number.NaN, 10)).toBe(0);
    expect(barHeightPercent(4, 0)).toBe(0);
  });

  it('never draws past the top of the plot', () => {
    expect(barHeightPercent(15, 10)).toBe(100);
  });
});

describe('nextActiveIndex', () => {
  it('treats no selection as the latest bar', () => {
    expect(nextActiveIndex(null, 'ArrowLeft', 12)).toBe(10);
    expect(nextActiveIndex(null, 'ArrowRight', 12)).toBe(11);
  });

  it('moves one bar at a time and stops at both ends', () => {
    expect(nextActiveIndex(4, 'ArrowLeft', 12)).toBe(3);
    expect(nextActiveIndex(4, 'ArrowRight', 12)).toBe(5);
    expect(nextActiveIndex(0, 'ArrowLeft', 12)).toBe(0);
    expect(nextActiveIndex(11, 'ArrowRight', 12)).toBe(11);
  });

  it('jumps to the first and last bars', () => {
    expect(nextActiveIndex(6, 'Home', 12)).toBe(0);
    expect(nextActiveIndex(null, 'Home', 12)).toBe(0);
    expect(nextActiveIndex(2, 'End', 12)).toBe(11);
  });

  it('pulls an out-of-range selection back inside the chart', () => {
    expect(nextActiveIndex(40, 'ArrowLeft', 12)).toBe(10);
    expect(nextActiveIndex(-5, 'ArrowRight', 12)).toBe(1);
  });

  it('leaves every other key to the page', () => {
    // undefined means "not ours": the chart must not preventDefault Tab,
    // Enter, Escape or the up/down arrows that scroll the page.
    for (const key of ['Tab', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'a']) {
      expect(nextActiveIndex(3, key, 12)).toBeUndefined();
    }
  });

  it('has nothing to select in an empty chart', () => {
    expect(nextActiveIndex(null, 'ArrowLeft', 0)).toBeNull();
    expect(nextActiveIndex(2, 'End', 0)).toBeNull();
  });
});
