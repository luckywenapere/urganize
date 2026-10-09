import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The guided tour's step controls (2026-10-09, v1.92.4).
 *
 * A live review found the tour card's pagination unlike the rest of the app: a
 * bare "2 of 3" in small grey type, a 24px "Skip" text link and a 32px Next
 * button, on a card shown mostly on phones. It now uses the app's stepped-flow
 * eyebrow ("Step 2 of 3" plus the stroke-strong/brand bar, as in the team
 * brief's guided mode) and 44px controls built from theme tokens.
 *
 * Components are not rendered in this repo's tests, so these hold the markup
 * in the source, the way the other guard tests do.
 */

const APP_ROOT = process.cwd();
const overlay = readFileSync(join(APP_ROOT, 'components/tours/TourOverlay.tsx'), 'utf8');

/** The JSX the overlay returns, so the docblock's prose cannot satisfy a check. */
const markup = overlay.slice(overlay.indexOf('return createPortal('));

describe('tour card pagination', () => {
  it('reads its step label from tourStepProgress, not an inline "N of M"', () => {
    expect(markup).toContain('{progress.label}');
    expect(overlay).toContain('tourStepProgress(active.stepIndex, active.steps.length)');
    expect(markup).not.toMatch(/stepIndex \+ 1\}\s*of/);
  });

  it('draws the progress bar with the app meter tokens', () => {
    expect(markup).toContain('bg-stroke-strong');
    expect(markup).toContain('bg-brand');
    expect(markup).toContain('progress.percent');
  });

  it('gives Skip and the primary button a 44px tap target', () => {
    const skip = markup.slice(markup.indexOf('onClick={skip}'), markup.indexOf('Skip\n'));
    expect(skip).toContain('min-h-11');
    expect(skip).toContain('motion-focus');
    expect(markup).toMatch(/<Button ref=\{nextButtonRef\}[^>]*className="min-h-11"/);
    expect(markup).not.toContain('size="sm"');
  });

  it('uses theme tokens only: no hex, rgb literal or white/black utility in the card', () => {
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(markup).not.toMatch(/\brgba?\(\s*\d/);
    expect(markup).not.toMatch(/\b(?:bg|text|border)-(?:white|black)\b/);
  });
});
