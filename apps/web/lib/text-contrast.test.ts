import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The text tiers a reader has to READ must clear 4.5:1 on every ground they
// sit on. Tertiary sat at 2.5:1 (light) and 3.2:1 (dark) while carrying real
// content (labels, timestamps, hints), which the 2026-09-30 interface review
// found on nearly every screen. Quaternary is decorative and is deliberately
// not held to this.

const css = readFileSync(join(__dirname, '..', 'app', 'globals.css'), 'utf8');

type Rgb = [number, number, number];

/** The declaration block for a selector that sets the text tokens. */
function block(selector: string): string {
  let from = 0;
  for (;;) {
    const start = css.indexOf(`${selector} {`, from);
    if (start === -1) throw new Error(`no ${selector} block with text tokens`);
    const end = css.indexOf('\n}', start);
    const body = css.slice(start, end);
    if (body.includes('--color-text-tertiary')) return body;
    from = start + 1;
  }
}

function token(scope: string, name: string): Rgb {
  const match = scope.match(new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+);`));
  if (!match) throw new Error(`no --${name} in scope`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function blend(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((f, i) => Math.round(f * alpha + bg[i] * (1 - alpha))) as Rgb;
}

const GROUNDS = ['color-bg-base', 'color-bg-surface', 'color-bg-elevated', 'color-bg-hover'];

const THEMES: Array<[string, string]> = [
  ['dark (:root)', ':root'],
  ['dark (data-theme)', "html[data-theme='dark']"],
  ['light', "html[data-theme='light']"],
];

describe('text tiers keep 4.5:1 on every ground', () => {
  for (const [label, selector] of THEMES) {
    const scope = block(selector);
    for (const tier of ['color-text-secondary', 'color-text-tertiary']) {
      it(`${tier} on ${label}`, () => {
        const text = token(scope, tier);
        for (const ground of GROUNDS) {
          expect(contrast(text, token(scope, ground))).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
    it(`tertiary stays visibly below secondary on ${label}`, () => {
      const secondary = luminance(token(scope, 'color-text-secondary'));
      const tertiary = luminance(token(scope, 'color-text-tertiary'));
      // Hierarchy: the two tiers must not collapse into one grey.
      expect(Math.abs(secondary - tertiary)).toBeGreaterThan(0.03);
    });
  }
});

describe('the faint tier on the dark-locked public pages', () => {
  const ink: Rgb = [13, 18, 14];
  const cream: Rgb = [245, 240, 230];

  it('every island faint token is at least 4.5:1 on ink', () => {
    const tokens = [...css.matchAll(/--(epk|credits|capture|kit)-text-faint:\s*rgba\(245, 240, 230, ([\d.]+)\);/g)];
    expect(tokens.length).toBe(4);
    for (const [, , alpha] of tokens) {
      expect(contrast(blend(cream, ink, Number(alpha)), ink)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the calendar faint token is 4.5:1 in both themes', () => {
    const dark = css.match(/\.cc-island \{[^}]*--cc-text-faint:\s*rgba\(245, 240, 230, ([\d.]+)\)/);
    const light = css.match(/html\[data-theme='light'\] \.cc-island \{[^}]*--cc-text-faint:\s*rgba\(26, 22, 17, ([\d.]+)\)/);
    expect(dark).not.toBeNull();
    expect(light).not.toBeNull();
    expect(contrast(blend(cream, ink, Number(dark![1])), ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(blend([26, 22, 17], cream, Number(light![1])), cream)).toBeGreaterThanOrEqual(4.5);
  });
});
