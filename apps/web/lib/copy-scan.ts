/**
 * Pull the strings a person can actually read out of a source file.
 *
 * Extracted from `lib/press-kit-copy-guard.test.ts` when the positioning guard
 * needed the same reader (2026-09-09). That file's own header already gave the
 * reason to share rather than copy: "two guards would drift the moment one of
 * them gained a rule", and a scanner that disagreed between two guards would
 * make one of them quietly weaker than it reads.
 *
 * TWO DELIBERATE BLIND SPOTS, both of which cost more to close than to accept:
 *
 *  - **Comments are exempt.** They are the working record of why the code is
 *    the way it is, and they hold dates, prose and the odd quotation. Holding
 *    them to product copy rules would either gut them or teach everyone to
 *    work around the test.
 *  - **A string with no whitespace is treated as an identifier.** That is what
 *    lets a guard run over real source without tripping on a class name, a
 *    route, a storage key or `?tab=workspace`. The cost is that a genuinely
 *    user-facing SINGLE word slips through, so an `aria-label="Workspace"` is
 *    invisible here and has to be found by reading. Loosening this makes every
 *    guard that uses it unusable.
 */

/** Source with block and line comments removed. The `[^:]` guard on the line
 * form is what stops it eating the `//` inside a `https://` URL. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function userFacingStrings(source: string): string[] {
  const matches = stripComments(source).match(/(['"])(?:\\.|(?!\1)[^\\\r\n])*\1/g) || [];
  return matches
    .map((raw) => raw.slice(1, -1))
    // Anything with no space is an identifier, a class name, a path or a key.
    // A sentence a person reads has spaces in it.
    .filter((value) => /\s/.test(value.trim()) && /[a-z]{3}/i.test(value));
}

/**
 * Template literals too, with their `${...}` holes blanked out.
 *
 * `userFacingStrings` reads quoted strings only, which was enough for the
 * press kit. Marketing copy is full of backticks, so a guard scanning
 * `apps/homepage` without this would report clean on a page whose every
 * sentence is a template literal. Interpolations are replaced rather than kept
 * because the hole's contents are an expression, not copy.
 */
export function userFacingTemplates(source: string): string[] {
  const matches = stripComments(source).match(/`(?:\\.|[^\\`])*`/g) || [];
  return matches
    .map((raw) => raw.slice(1, -1).replace(/\$\{[^}]*\}/g, ' '))
    .filter((value) => /\s/.test(value.trim()) && /[a-z]{3}/i.test(value));
}

/**
 * One piece of readable copy, and which of the three readers found it.
 *
 * `from` matters for exactly one reason: JSX text is the only reader that can
 * mistake CODE for copy. Its `>`...`<` rule will start at the `>` of an arrow
 * function (`(r) => r.id === releaseId); if (!release) return null; return (`)
 * and run to the next JSX tag. A quoted string or a template literal is a
 * string by construction, however much punctuation it carries.
 *
 * Added 2026-09-25 for `lib/rollout-vocabulary.test.ts`, which used to apply a
 * "this looks like code" skip to every segment and so skipped UrgAns's whole
 * system prompt, a 12,000-character template literal, because it contains one
 * `);`. Knowing where a segment came from lets a guard keep that skip where it
 * belongs. `readableCopy` is unchanged: same pieces, same order.
 */
export type CopySegment = { text: string; from: 'string' | 'template' | 'jsx' };

/** Everything a person can read in one file, tagged by the reader that found
 * it: quoted strings, template literals, and the text between JSX tags. */
export function readableCopySegments(source: string): CopySegment[] {
  const withoutComments = stripComments(source);
  // JSX text nodes: what sits between a `>` and the next `<`. Anything holding
  // a `{` is an expression container rather than prose, so it is dropped and
  // its own string literals are caught by the two readers above.
  const jsxText = (withoutComments.match(/>[^<>{}]+</g) || []).map((raw) => raw.slice(1, -1));

  const found: CopySegment[] = [
    ...userFacingStrings(source).map((text) => ({ text, from: 'string' as const })),
    ...userFacingTemplates(source).map((text) => ({ text, from: 'template' as const })),
    ...jsxText.map((text) => ({ text, from: 'jsx' as const })),
  ];
  return found
    .map((segment) => ({ ...segment, text: segment.text.replace(/\s+/g, ' ').trim() }))
    .filter((segment) => /\s/.test(segment.text) && /[a-z]{3}/i.test(segment.text));
}

/** Everything a person can read in one file: quoted strings, template
 * literals, and the text between JSX tags. */
export function readableCopy(source: string): string[] {
  return readableCopySegments(source).map((segment) => segment.text);
}
