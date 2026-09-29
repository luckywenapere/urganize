import { describe, expect, it } from 'vitest';

import {
  readableCopy,
  readableCopySegments,
  userFacingStrings,
  userFacingTemplates,
} from './copy-scan';

/**
 * The extractor under two guards, so its contract is pinned rather than
 * inferred from whichever guard happens to fail.
 *
 * `lib/press-kit-copy-guard.test.ts` and `lib/positioning-guard.test.ts` are
 * both only as strong as this module: a reader that quietly stopped seeing
 * template literals would leave the marketing site unguarded while every test
 * still passed green. So the two DOCUMENTED BLIND SPOTS are asserted here as
 * deliberate behaviour, not left as prose in a header comment somebody could
 * "fix" in good faith.
 */
describe('userFacingStrings', () => {
  it('reads a quoted sentence', () => {
    expect(userFacingStrings('const a = "Plan your next release";')).toEqual([
      'Plan your next release',
    ]);
  });

  it('treats a string with no whitespace as an identifier', () => {
    // The blind spot, stated as a rule. This is what lets a guard run over real
    // source without tripping on a class name, a route or a storage key, and
    // the cost is that a single-word `aria-label` is invisible to it.
    expect(userFacingStrings('el.setAttribute("aria-label", "Workspace");')).toEqual([]);
    expect(userFacingStrings('const cls = "flex items-center gap-2";')).toEqual([
      'flex items-center gap-2',
    ]);
  });

  it('ignores both comment forms', () => {
    const source = [
      '// Urganize is the AI workspace for music executives.',
      '/* And so is this one. */',
      'const live = "This one is real copy";',
    ].join('\n');

    expect(userFacingStrings(source)).toEqual(['This one is real copy']);
  });

  it('does not mistake the slashes in a URL for a comment', () => {
    // The `[^:]` guard in stripComments. Without it everything after `https:`
    // on the line disappears, so a whole file of copy can read as clean.
    const source = 'const link = "https://urganize.app — read the docs here";';
    expect(userFacingStrings(source)).toEqual([
      'https://urganize.app — read the docs here',
    ]);
  });

  it('skips a string with no letters to speak of', () => {
    expect(userFacingStrings('const sep = " / ";')).toEqual([]);
  });
});

describe('userFacingTemplates', () => {
  it('reads a template literal and blanks its interpolations', () => {
    const source = 'const line = `Urganize is an ${PRODUCT_CATEGORY} for teams`;';
    expect(userFacingTemplates(source)).toEqual(['Urganize is an   for teams']);
  });

  it('finds nothing in a quoted string', () => {
    // The two readers are deliberately separate: a guard that wants both has to
    // ask for both, which is what `readableCopy` is for.
    expect(userFacingTemplates('const a = "Plan your next release";')).toEqual([]);
  });
});

describe('readableCopy', () => {
  it('reads JSX text between tags', () => {
    expect(readableCopy('<p>Every release runs to plan.</p>')).toContain(
      'Every release runs to plan.',
    );
  });

  it('drops a JSX expression container rather than reading it as prose', () => {
    // `{PROMISE}` is an expression, not copy. Its own string literal, wherever
    // it is declared, is caught by the string reader instead.
    expect(readableCopy('<p>{PROMISE} and nothing else</p>')).not.toContain(
      '{PROMISE} and nothing else',
    );
  });

  it('collapses whitespace so a wrapped sentence matches as one line', () => {
    const source = '<p>\n  Plan, organize and execute\n  rollouts from one place.\n</p>';
    expect(readableCopy(source)).toContain(
      'Plan, organize and execute rollouts from one place.',
    );
  });

  it('reads all three shapes out of one file', () => {
    const source = [
      '// A comment that says workspace and is exempt.',
      'const title = "The release plan";',
      'const line = `An ${CATEGORY} for everyone`;',
      'export const El = () => <p>One link per artist.</p>;',
    ].join('\n');

    const copy = readableCopy(source);
    expect(copy).toContain('The release plan');
    // Collapsed: `readableCopy` squeezes whitespace, the individual readers do
    // not. Which means a phrase split across an interpolation closes up here.
    expect(copy).toContain('An for everyone');
    expect(copy).toContain('One link per artist.');
    expect(copy.join(' ')).not.toContain('exempt');
  });

  it('closes the gap an interpolation leaves, unlike the raw template reader', () => {
    // Worth knowing when writing a guard pattern: a retired phrase written as
    // `AI ${w} for executives` reads here as "AI for executives", so a pattern
    // matching the phrase VERBATIM would miss it. Every pattern in
    // lib/positioning-guard.test.ts is a phrase nobody would interpolate
    // through the middle of, which is what makes that acceptable.
    const source = 'const a = `AI ${word} for executives`;';
    expect(userFacingTemplates(source)).toEqual(['AI   for executives']);
    expect(readableCopy(source)).toEqual(['AI for executives']);
  });
});

describe('readableCopySegments', () => {
  const source = [
    'const title = "The release plan";',
    'const line = `An ${CATEGORY} for everyone`;',
    'export const El = () => <p>One link per artist.</p>;',
  ].join('\n');

  it('tags every piece with the reader that found it', () => {
    expect(readableCopySegments(source)).toEqual([
      { text: 'The release plan', from: 'string' },
      { text: 'An for everyone', from: 'template' },
      { text: 'One link per artist.', from: 'jsx' },
    ]);
  });

  it('is exactly what readableCopy returns, in the same order', () => {
    // readableCopy is built from this, and two guards read readableCopy. A
    // piece dropped, added or reordered here would change what they check.
    const mixed = [
      source,
      "const cls = 'flex items-center gap-2';",
      '<span>Every release you run</span>',
      'const x = `one ${a} two ${b} three`;',
    ].join('\n');
    expect(readableCopySegments(mixed).map((segment) => segment.text)).toEqual(readableCopy(mixed));
  });

  it('marks code the JSX reader misread as jsx, never as a string', () => {
    // The `>` of the arrow starts a "JSX text" span that runs to the next tag.
    // Knowing it came from the JSX reader is what lets a guard treat it as
    // code without skipping real copy in strings and templates.
    const code = 'const r = rs.find((r) => r.id === releaseId); if (!release) return null; return (<div>Hi</div>);';
    expect(readableCopySegments(code)).toEqual([
      { text: 'r.id === releaseId); if (!release) return null; return (', from: 'jsx' },
    ]);
  });
});
