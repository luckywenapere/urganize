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
  // The green dark palette the founder picked (URG-256).
  ['dark green palette', ":root:not([data-theme='light'])"],
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
    // The credits page moved to the app's near-black palette on 2026-10-27
    // and is checked on its own below.
    const tokens = [...css.matchAll(/--(epk|capture|kit)-text-faint:\s*rgba\(245, 240, 230, ([\d.]+)\);/g)];
    expect(tokens.length).toBe(3);
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

describe('the legacy text tiers cannot drift from the rgb tokens', () => {
  // There were two hand-kept sets: the rgb triples Tailwind reads and a hex set
  // the older CSS classes read (.field-label, .saas-eyebrow, .kbd, .icon-btn).
  // Only the first was corrected, so light tertiary sat at 2.6:1 and dark at
  // 3.5:1 in the second. Deriving the hex set from the rgb one leaves nothing
  // to keep in step.
  for (const [label, selector] of THEMES) {
    it(`--text-secondary and --text-tertiary are derived on ${label}`, () => {
      const scope = block(selector);
      expect(scope).toMatch(/--text-secondary:\s*rgb\(var\(--color-text-secondary\)\);/);
      expect(scope).toMatch(/--text-tertiary:\s*rgb\(var\(--color-text-tertiary\)\);/);
    });
  }
});

// A form field's boundary must be findable: 3:1 against what it sits on
// (WCAG 1.4.11). The hairline strokes are ~1.1:1 by design, for cards and
// dividers, and had been copied onto every input. lib/field-border-guard.test.ts
// keeps fields on the token; this keeps the token honest.
const CONTROL_GROUNDS = [
  'color-bg-base',
  'color-bg-sidebar',
  'color-bg-surface',
  'color-bg-elevated',
  'color-bg-overlay',
  'color-bg-hover',
  'color-bg-active',
];

describe('form-control borders keep 3:1 on every ground', () => {
  for (const [label, selector] of THEMES) {
    it(`--color-stroke-control on ${label}`, () => {
      const scope = block(selector);
      const border = token(scope, 'color-stroke-control');
      for (const ground of CONTROL_GROUNDS) {
        expect(contrast(border, token(scope, ground)), `${ground} on ${label}`).toBeGreaterThanOrEqual(3);
      }
    });

    it(`the legacy --border-control follows it on ${label}`, () => {
      expect(block(selector)).toMatch(/--border-control:\s*rgb\(var\(--color-stroke-control\)\);/);
    });
  }

  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const inputRule = (state: string) =>
    new RegExp(`(?:^|\\n)\\.input${state}\\s*\\{([^}]*)\\}`).exec(bare);

  it('the .input placeholder is a readable tier, not the decorative one', () => {
    // Placeholder text is read, so it needs 4.5:1. It was quaternary, near 2:1 on ink.
    const rule = inputRule('::placeholder');
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--text-tertiary\)/);
    expect(rule![1]).not.toMatch(/quaternary/);
  });

  it('the .input hover border is never one of the hairline tiers', () => {
    // --border-strong is ~1.26:1; using it on hover made the outline fade when
    // the field was pointed at.
    const rule = inputRule(':hover');
    expect(rule).not.toBeNull();
    expect(rule![1]).not.toMatch(/--border-(?:subtle|default|strong)/);
  });

  it('the hairline tiers stay faint, so cards and dividers keep their quiet look', () => {
    // If someone "fixes" the contrast by strengthening these, every card in
    // the app grows a heavy outline. The control token is the one to use.
    expect(css).toMatch(/--border-default:\s*rgba\(245, 240, 230, 0\.06\);/);
    expect(css).toMatch(/--border-default:\s*rgba\(26, 22, 17, 0\.09\);/);
  });
});

describe('field borders on the dark-locked pages and the calendar', () => {
  const ink: Rgb = [13, 18, 14];
  const surface: Rgb = [24, 29, 25];
  const cream: Rgb = [245, 240, 230];
  const inkText: Rgb = [26, 22, 17];

  for (const name of ['capture']) {
    it(`--${name}-field-border is 3:1 on the ground and on the field fill`, () => {
      const match = css.match(new RegExp(`--${name}-field-border:\\s*rgba\\(245, 240, 230, ([\\d.]+)\\);`));
      expect(match).not.toBeNull();
      // The border is painted over the field's own surface fill; outside it is the ground.
      const border = blend(cream, surface, Number(match![1]));
      expect(contrast(border, ink)).toBeGreaterThanOrEqual(3);
      expect(contrast(border, surface)).toBeGreaterThanOrEqual(3);
    });
  }

  it('the calendar field border is 3:1 in both themes', () => {
    const dark = css.match(/\.cc-island \{[^}]*--cc-field-border:\s*rgba\(245, 240, 230, ([\d.]+)\)/);
    const light = css.match(/html\[data-theme='light'\] \.cc-island \{[^}]*--cc-field-border:\s*rgba\(26, 22, 17, ([\d.]+)\)/);
    expect(dark).not.toBeNull();
    expect(light).not.toBeNull();
    expect(contrast(blend(cream, ink, Number(dark![1])), ink)).toBeGreaterThanOrEqual(3);
    expect(contrast(blend(inkText, cream, Number(light![1])), cream)).toBeGreaterThanOrEqual(3);
  });
});

describe('green palette accent (URG-256)', () => {
  {
    const scope = block(":root:not([data-theme='light'])");
    it('the green accent is 4.5:1 on every ground, and its button label is 4.5:1 on it', () => {
      const brand = token(scope, 'color-brand');
      for (const ground of CONTROL_GROUNDS) {
        expect(contrast(brand, token(scope, ground)), ground).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(token(scope, 'color-text-inverse'), brand)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// The credits page wears the app's current near-black palette (2026-10-27),
// written as plain hex rather than the ink islands' cream-over-ink alphas.
describe('the credits page palette', () => {
  const island = css.match(/\.credits-island \{([^}]*)\}/);
  const hex = (name: string): Rgb => {
    const value = new RegExp(`--credits-${name}:\\s*#([0-9a-f]{6});`).exec(island?.[1] || '');
    expect(value).not.toBeNull();
    const h = value![1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  };

  it('muted and faint text are 4.5:1 on the ground and on a field', () => {
    for (const name of ['text-muted', 'text-faint']) {
      expect(contrast(hex(name), hex('ground'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex(name), hex('surface'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the field border is 3:1 on the ground and on the field fill', () => {
    expect(contrast(hex('field-border'), hex('ground'))).toBeGreaterThanOrEqual(3);
    expect(contrast(hex('field-border'), hex('surface'))).toBeGreaterThanOrEqual(3);
  });
});
