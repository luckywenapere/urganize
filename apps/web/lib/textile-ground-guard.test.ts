import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A viewport-level page wrapper must not paint its own opaque ground.
 *
 * WHY, found 2026-09-07 by rendering paper mode with the textile flag on. The
 * ambient weave lives on `body::after` at `z-index: 0`, and `.app-layout` sits
 * at `z-index: 1` — so anything inside it with an opaque background covers the
 * layer completely. Every page wrapper carried `bg-bg-base`, which meant the
 * grain reached only the ~38px margins either side and never the content area.
 * Measured on /auth at 1280px wide: the wrapper spanned x=38.4 to 1241.6, and
 * cranking the weave to bright red at 90% opacity still rendered a flat field.
 *
 * `body` already carries `bg-bg-base` (app/layout.tsx), and neither `.app-body`
 * nor `.app-layout` sets a background of its own, so dropping it from a wrapper
 * changes NO colour in either theme and with the flag either way. It only stops
 * the wrapper hiding what is behind it.
 *
 * The rule is worth a test rather than a comment because the failure is
 * invisible: the page looks correct, and the only symptom is ornament that
 * silently does not arrive. A new page written by copying an existing one would
 * reintroduce it without anybody noticing.
 */

const ROOTS = ['app', 'components'];

// A wrapper that fills the viewport, in the shapes this codebase writes them.
// `<main>` is always the page here, so it counts on its own.
const VIEWPORT_MARKERS = ['min-h-screen', 'min-h-full', 'min-h-dvh', '100dvh'];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsxFiles(path));
    else if (path.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/**
 * Blank out comment content, preserving every newline.
 *
 * A SINGLE-PASS SCANNER RATHER THAN TWO REGEXES, and both reasons are mistakes
 * the first version of this guard actually made.
 *
 * It stripped block comments first, so the line comment at
 * `WorkspaceView.tsx:923` mentioning the legacy `/plan/*` route group opened a
 * comment the non-greedy regex closed 300 lines later — eating 431 real lines
 * and hiding three of the offenders this test exists to find. A scanner in
 * `line` mode cannot see a `/*`, so that cannot happen.
 *
 * Then the counting check written to catch that cried wolf on `AdminNav.tsx`
 * and `AdminPageSkeleton.tsx`, whose comment BODIES mention `/admin/*` — a
 * `/*` inside an already-open comment is text, and no count of the two
 * sequences can tell the difference. A scanner in `block` mode ignores it.
 *
 * Newlines survive, so reported line numbers are the real ones. The regex
 * version deleted lines and reported indices into the stripped source, which
 * sends the next reader to the wrong place.
 *
 * Limitation, stated rather than hidden: it does not model string literals, so
 * a `//` or `/*` inside one reads as a comment. That can only cause a false
 * NEGATIVE, never a false alarm, and this codebase writes no wrapper className
 * on the same line as such a string.
 */
export function stripComments(source: string): string {
  let out = '';
  let mode: 'code' | 'line' | 'block' = 'code';
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    const pair = source.slice(i, i + 2);

    if (mode === 'code') {
      if (pair === '//') { mode = 'line'; out += '  '; i += 2; continue; }
      if (pair === '/*') { mode = 'block'; out += '  '; i += 2; continue; }
      out += char;
      i += 1;
      continue;
    }

    if (mode === 'line') {
      if (char === '\n') { mode = 'code'; out += '\n'; i += 1; continue; }
      out += ' ';
      i += 1;
      continue;
    }

    if (pair === '*/') { mode = 'code'; out += '  '; i += 2; continue; }
    out += char === '\n' ? '\n' : ' ';
    i += 1;
  }

  return out;
}

export function offendingLines(source: string): string[] {
  const hits: string[] = [];
  stripComments(source)
    .split('\n')
    .forEach((line, index) => {
      if (!line.includes('bg-bg-base')) return;
      const isMain = line.includes('<main');
      const isViewport = VIEWPORT_MARKERS.some((marker) => line.includes(marker));
      if (isMain || isViewport) hits.push(`${index + 1}: ${line.trim()}`);
    });
  return hits;
}

describe('the textile ambient ground is not occluded by a page wrapper', () => {
  it('no viewport-level wrapper paints bg-bg-base', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of tsxFiles(root)) {
        for (const hit of offendingLines(readFileSync(file, 'utf8'))) {
          offenders.push(`${file}:${hit}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('body still carries the ground, which is what makes removal colour-neutral', () => {
    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).toMatch(/<body className="[^"]*\bbg-bg-base\b/);
  });
});

// The guard is only as good as its stripper, and the first version's was wrong
// in the direction that hides offenders. These pin the two real shapes.
describe('stripComments', () => {
  it('a line comment mentioning /plan/* does not swallow the code after it', () => {
    const source = [
      '// the legacy /plan/* route group this replaces',
      '<main className="min-h-screen bg-bg-base">',
      '{/* a real comment */}',
    ].join('\n');
    expect(offendingLines(source)).toEqual(['2: <main className="min-h-screen bg-bg-base">']);
  });

  it('a /* inside an open comment body is text, not a new opener', () => {
    const source = [
      '{/*',
      '  The way out. /admin/* renders no app chrome at all.',
      '*/}',
      '<main className="min-h-screen bg-bg-base">',
    ].join('\n');
    expect(offendingLines(source)).toEqual(['4: <main className="min-h-screen bg-bg-base">']);
  });

  it('still ignores a wrapper that only appears inside a comment', () => {
    expect(offendingLines('{/* was <main className="min-h-screen bg-bg-base"> */}')).toEqual([]);
  });

  it('preserves line numbering across a multi-line comment', () => {
    const source = ['/*', 'a', 'b', '*/', '<main className="bg-bg-base">'].join('\n');
    expect(offendingLines(source)).toEqual(['5: <main className="bg-bg-base">']);
  });
});
