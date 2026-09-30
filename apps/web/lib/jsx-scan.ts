/**
 * A small reader for JSX opening tags, for the tests that hold one rule over
 * every form field or every password input in the app.
 *
 * It is a scanner and not a parser: it finds `<input`, `<select` and friends,
 * walks to the `>` that closes the tag (skipping quoted strings and `{...}`
 * expressions, where a stray `>` is common), and hands back the text. That is
 * enough to ask "what does this field's className say", which is all these
 * guards need. Vitest in this repo runs only `lib/` and `app/` tests in a Node
 * environment with no DOM, so reading source is how a rule about components
 * gets enforced at all (the same reason lib/copy-scan.ts exists).
 */

export type JsxTag = {
  name: string;
  /** The whole opening tag, from `<` to the closing `>`. */
  text: string;
  /** Offset of the `<` in the source. */
  index: number;
  /** 1-based line of the `<`. */
  line: number;
};

/** Index just past the `>` that closes the tag starting at `start`. */
function endOfTag(source: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return i + 1;
  }
  // An unterminated tag: return a bounded slice rather than the rest of the file.
  return Math.min(source.length, start + 400);
}

export function openingTags(source: string, names: readonly string[]): JsxTag[] {
  const found: JsxTag[] = [];
  for (const name of names) {
    const needle = `<${name}`;
    let from = 0;
    for (;;) {
      const index = source.indexOf(needle, from);
      if (index === -1) break;
      from = index + needle.length;
      // `<input` must not match `<inputs` or `<Inputs`; the next character has
      // to end the name.
      const next = source[index + needle.length];
      if (next === undefined || !(/\s/.test(next) || next === '/' || next === '>')) continue;
      const text = source.slice(index, endOfTag(source, index));
      found.push({ name, text, index, line: source.slice(0, index).split('\n').length });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/**
 * The raw text of one attribute: the inside of `name="..."`, or the inside of
 * the braces in `name={...}`. Null when the tag has no such attribute.
 */
export function attribute(tag: Pick<JsxTag, 'text'>, name: string): string | null {
  const text = tag.text;
  let from = 0;
  for (;;) {
    const at = text.indexOf(`${name}=`, from);
    if (at === -1) return null;
    from = at + name.length + 1;
    // Must start an attribute, not end another (`inputClassName=` is not `className=`).
    const before = text[at - 1];
    if (before !== undefined && !/\s/.test(before)) continue;
    const open = text[at + name.length + 1];
    if (open === '"' || open === "'") {
      const close = text.indexOf(open, at + name.length + 2);
      return close === -1 ? null : text.slice(at + name.length + 2, close);
    }
    if (open === '{') {
      let depth = 0;
      let quote: string | null = null;
      for (let i = at + name.length + 1; i < text.length; i += 1) {
        const ch = text[i];
        if (quote) {
          if (ch === '\\') {
            i += 1;
            continue;
          }
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') quote = ch;
        else if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) return text.slice(at + name.length + 2, i);
        }
      }
    }
    return null;
  }
}

/** The initializer of `const NAME = ...;` in this file, or null. */
export function constInitializer(source: string, name: string): string | null {
  const pattern = new RegExp(`\\b(?:const|let)\\s+${name}\\b[^=\\n]*=\\s*`);
  const match = pattern.exec(source);
  if (!match) return null;
  const start = match.index + match[0].length;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
    else if (ch === ';' && depth <= 0) return source.slice(start, i);
  }
  return null;
}

const IDENTIFIER = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const NOT_A_CLASS_CONST = new Set(['clsx', 'cn', 'cx', 'true', 'false', 'null', 'undefined', 'className']);

/**
 * Everything that decides a tag's classes: the className attribute plus any
 * same-file const it points at (`className={inputClass}` or
 * `` `${fieldClass} mt-1` ``). A const imported from another file is not
 * followed, so the answer is a floor and not a proof; for this app's fields
 * every shared class string is defined in the file that uses it.
 */
export function classText(source: string, tag: Pick<JsxTag, 'text'>): string {
  const raw = attribute(tag, 'className');
  if (raw === null) return '';
  const parts = [raw];
  for (const word of raw.match(IDENTIFIER) ?? []) {
    if (NOT_A_CLASS_CONST.has(word)) continue;
    const initializer = constInitializer(source, word);
    if (initializer && /["'`]/.test(initializer)) parts.push(initializer);
  }
  return parts.join(' ');
}
