import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pinch-zoom stays open; one-finger horizontal panning and double-tap zoom stay
 * closed.
 *
 * `touch-action: pan-y` on html and body was the fix for the page drifting
 * sideways under a swipe (2026-08-17), and as a side effect it also switched
 * off pinch-zoom, because pan-y admits no zoom gesture. A reader with low
 * vision has to be able to enlarge the page (WCAG 1.4.4), and the viewport meta
 * sets no scale limit, so that one declaration was all that stopped them.
 * `pan-y pinch-zoom` keeps the drift fix and the stiff feel (no double-tap
 * zoom, no sideways swipe) and gives the pinch back.
 *
 * Reading the stylesheet is the only way to hold this: there is no device in
 * vitest, and nothing type-checks a CSS value.
 */

const WEB = join(__dirname, '..');
const css = readFileSync(join(WEB, 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function declaration(selector: string, property: string): string[] | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!rule) return null;
  const value = new RegExp(`${property}:\\s*([^;]+);`).exec(rule[1]);
  return value ? value[1].trim().split(/\s+/).sort() : null;
}

describe('touch-action on the document', () => {
  it('html allows vertical pan and pinch-zoom, and nothing else', () => {
    expect(declaration('html', 'touch-action')).toEqual(['pan-y', 'pinch-zoom']);
  });

  it('body allows vertical pan and pinch-zoom, and nothing else', () => {
    expect(declaration('body', 'touch-action')).toEqual(['pan-y', 'pinch-zoom']);
  });

  it('a horizontal scroller allows horizontal pan and pinch-zoom, and nothing else', () => {
    expect(declaration('.overflow-x-auto', 'touch-action')).toEqual(['pan-x', 'pinch-zoom']);
  });

  it('nothing re-enables double-tap zoom on the document', () => {
    // `manipulation` and `auto` both admit one-finger horizontal pan, which is
    // the drift the lock exists to stop.
    for (const selector of ['html', 'body']) {
      const value = declaration(selector, 'touch-action') ?? [];
      expect(value).not.toContain('manipulation');
      expect(value).not.toContain('auto');
      expect(value).not.toContain('pan-x');
    }
  });
});

describe('the viewport', () => {
  const layout = readFileSync(join(WEB, 'app', 'layout.tsx'), 'utf8');
  const viewport = /export const viewport[^=]*=\s*\{([\s\S]*?)\n\};/.exec(layout);

  it('is declared where this test expects it', () => {
    expect(viewport).not.toBeNull();
  });

  it('sets no scale limit', () => {
    const body = viewport![1];
    expect(body).not.toMatch(/maximumScale|minimumScale|userScalable/);
  });

  it('no source file writes a viewport meta that forbids scaling', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        if (entry === 'node_modules' || entry === '.next') return [];
        const path = join(dir, entry);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    const offenders = ['app', 'components', 'lib']
      .flatMap((dir) => walk(join(WEB, dir)))
      .filter((path) => /\.tsx?$/.test(path) && !path.endsWith('touch-zoom-guard.test.ts'))
      .filter((path) => /user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0)?\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(WEB, path).split(sep).join('/'));
    expect(offenders).toEqual([]);
  });
});
