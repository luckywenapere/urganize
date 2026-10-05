import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Home's columns must be allowed to shrink below their content.
 *
 * A grid track written `1fr` is `minmax(auto, 1fr)`: the column's floor is the
 * widest thing inside it. Every row on Home is a flex row holding a `truncate`
 * (nowrap) title, and nowrap text contributes its FULL width to that floor, so
 * the one-column phone layout grew to fit the longest task title (measured: a
 * card 504px wide in a 361px space) and the page clipped everything past the
 * right edge. `minmax(0, 1fr)` makes the floor zero, so the column is exactly
 * the width it is given and `truncate` does its job.
 *
 * Reading the stylesheet is the only way to hold this: vitest has no layout
 * engine, and nothing type-checks a CSS value.
 */

const WEB = join(__dirname, '..');
const css = readFileSync(join(WEB, 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const skeleton = readFileSync(join(WEB, 'components', 'loading', 'HomeSkeleton.tsx'), 'utf8');

/** Every `grid-template-columns` value declared inside a `.home-two-col` rule. */
function homeColumnTemplates(): string[] {
  const values: string[] = [];
  const rule = /\.home-two-col\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rule.exec(css))) {
    const value = /grid-template-columns:\s*([^;]+);/.exec(match[1]);
    if (value) values.push(value[1].trim());
  }
  return values;
}

describe('Home column tracks', () => {
  it('declares the one-column, two-column and no-container-query layouts', () => {
    expect(homeColumnTemplates()).toHaveLength(3);
  });

  it('never uses a bare 1fr, which would let a long title stretch the page', () => {
    for (const template of homeColumnTemplates()) {
      const tracks = template.split(/\s+(?![^(]*\))/);
      for (const track of tracks) {
        expect(track, `"${template}"`).toMatch(/^minmax\(0,\s*1fr\)$/);
      }
    }
  });
});

describe('Home loading skeleton', () => {
  it('uses the same container and column classes as the real layout', () => {
    // A skeleton on the viewport `sm:` breakpoint and a page on a container
    // query paint different columns for the same width, so the screen jumps
    // the moment data arrives.
    expect(skeleton).toContain('home-scene-container');
    // The long lists are folded on the real page, so the skeleton no longer
    // reserves the two-column block; it must also not invent its own columns.
    expect(skeleton).not.toMatch(/sm:grid-cols-2/);
  });
});
