import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The corner scale has two homes: the `--radius-*` variables in globals.css and
 * the Tailwind `borderRadius` in the shared preset. They disagreed from the
 * first commit: the variables said 0px while every component asked for rounded
 * corners through Tailwind. The only CSS that read the variables was the
 * `.input` class, which therefore overrode each caller's `rounded-*` and drew
 * square fields nobody asked for.
 *
 * The Brand Bible sets no rule on corner shape (checked 2026-09-30, all 17
 * pages), and the July restyle kept this scale, so the variables were the stale
 * half. This holds them equal so the question does not come back as a bug.
 */

const WEB = join(__dirname, '..');
const css = readFileSync(join(WEB, 'app', 'globals.css'), 'utf8');
const preset = readFileSync(join(WEB, '..', '..', 'packages', 'config', 'tailwind', 'preset.js'), 'utf8');

const STEPS = ['sm', 'md', 'lg', 'xl', '2xl'];

function presetRadius(step: string): string | null {
  const block = /borderRadius:\s*\{([^}]*)\}/.exec(preset);
  if (!block) return null;
  const value = new RegExp(`(?:"${step}"|\\b${step}):\\s*"([^"]+)"`).exec(block[1]);
  return value ? value[1] : null;
}

function cssRadius(step: string): string | null {
  const value = new RegExp(`--radius-${step}:\\s*([^;]+);`).exec(css);
  return value ? value[1].trim() : null;
}

describe('the corner scale', () => {
  for (const step of STEPS) {
    it(`--radius-${step} matches the Tailwind rounded-${step}`, () => {
      expect(presetRadius(step)).not.toBeNull();
      expect(cssRadius(step)).toBe(presetRadius(step));
    });
  }

  it('is not square', () => {
    for (const step of STEPS) expect(cssRadius(step)).not.toMatch(/^0(?:px)?$/);
  });

  it('keeps the pill at 9999px', () => {
    expect(cssRadius('full')).toBe('9999px');
  });
});

describe('the .input class', () => {
  const rule = /(?:^|\n)\.input\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''));

  it('is found', () => {
    expect(rule).not.toBeNull();
  });

  it('sets no border-radius, so the caller rounded-* decides', () => {
    expect(rule![1]).not.toMatch(/border-radius/);
  });

  it('draws the control border', () => {
    expect(rule![1]).toMatch(/border:\s*1px solid var\(--border-control\)/);
  });
});
