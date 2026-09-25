// A hand-rolled, deliberately conservative markdown-to-segments formatter for
// UrgAns's chat replies. The model (openai/gpt-4o-mini) is told in the system
// prompt not to use markdown, and it does not reliably follow that — a reply
// like "- **Setup:** 26 tasks" showed up on screen with the asterisks still in
// it. No markdown library is added (boring-stack rule): this is a small pure
// module, tested exhaustively in `model-markup.test.ts`.
//
// Scope, per the 2026-09-24 founder call: text in **double asterisks** shows
// as bold; every other markdown symbol is removed rather than rendered (no
// heading glyphs, no real bullet glyphs, no code font, no table grid — those
// become plain text in the house voice, with bold preserved where the model
// used it). This module ONLY touches what reaches the chat transcript. Text
// UrgAns saves elsewhere (notes, activities, the plan, press kit sections,
// emails) is unsanitized and stays that way — see CLAUDE.md's working notes
// for why.
//
// The two exports are deliberately defined in terms of each other so they
// cannot drift: `stripModelMarkup` is exactly the joined plain text of
// `parseModelMarkup`'s segments.
//
// No React, no Node imports — pure so it runs identically in the browser (the
// chat renderer) and on the server (history cleanup in `chappi/runner.ts`).

export type MarkupSegment = { text: string; bold: boolean };

// A real chat reply is at most a few thousand characters (the model's own
// output-token ceiling). Anything wildly longer is not a reply this parser
// needs to understand line by line — return it untouched rather than run the
// full pipeline over it.
const MAX_PARSE_LENGTH = 100_000;

/**
 * Parses a model reply into a flat list of segments, each either plain or
 * bold. `\n` is preserved exactly inside segment text (never consumed by a
 * rule), so callers relying on `white-space: pre-wrap` — the chat bubble —
 * get line breaks in the same places the model wrote them.
 *
 * The one deliberately unsupported case: bold cannot span a line break
 * (`**Setup\n26**` does not bold). Inline markup is resolved one line at a
 * time, the same way a person reads a reply — line by line — and spanning it
 * would risk one unclosed `**` swallowing an entire multi-line answer.
 */
export function parseModelMarkup(text: string): MarkupSegment[] {
  if (text === '') return [];
  if (text.length > MAX_PARSE_LENGTH) return [{ text, bold: false }];

  const normalized = text.replace(/\r\n?/g, '\n');
  const rawLines = normalized.split('\n');

  // Cheap escape hatch: if none of the characters any rule below reacts to
  // are present anywhere, and no single line is a bare horizontal rule, this
  // text has no markup — return it as one segment, untouched (not merely
  // equal), which is what makes "no markup in, no markup out" a guarantee
  // rather than something every rule has to individually preserve.
  const mightHaveMarkup = MARKUP_SNIFF.test(normalized) || rawLines.some((line) => HR_LINE.test(line));
  if (!mightHaveMarkup) {
    return [{ text, bold: false }];
  }

  const unwrapped = unwrapWholeReplyFence(rawLines);
  const lines = processLines(unwrapped);

  const segments: MarkupSegment[] = [];
  lines.forEach((line, index) => {
    if (index > 0) segments.push({ text: '\n', bold: false });
    if (line.verbatim) {
      segments.push({ text: line.text, bold: false });
    } else {
      for (const seg of parseInline(line.text)) {
        segments.push({ text: seg.text, bold: line.forceBold || seg.bold });
      }
    }
  });

  return mergeSegments(segments);
}

/** The plain-text equivalent of `parseModelMarkup` — for the copy button, and
 * for cleaning the model's own turns out of conversation history before they
 * go back to it as an example to imitate. */
export function stripModelMarkup(text: string): string {
  return parseModelMarkup(text)
    .map((segment) => segment.text)
    .join('');
}

// ---------------------------------------------------------------------------
// Quick-exit sniff
// ---------------------------------------------------------------------------

// Any of these characters means "possibly markup, run the real parser". Kept
// in sync by hand with the rules below — every rule reacts to one of these
// characters, so absence of all of them is sufficient for the fast path. `-`
// is deliberately excluded (an ordinary line of dashes, e.g. a date range, is
// common prose); a whole-line run of 3+ dashes is instead caught by HR_LINE.
const MARKUP_SNIFF = /[*_`~#|>[\\<]/;

// A single line made ONLY of 3+ of one of - * _ (interior spaces allowed) —
// the one construct not covered by MARKUP_SNIFF's character set. No `m` flag:
// always tested against one line at a time.
const HR_LINE = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

// ---------------------------------------------------------------------------
// Whole-reply fence unwrap
// ---------------------------------------------------------------------------

const FENCE_LINE = /^([ \t]{0,3})(`{3,}|~{3,})([^\n]*)$/;
const UNWRAPPABLE_INFO = new Set(['', 'md', 'markdown', 'text']);

/**
 * A model that wraps its ENTIRE reply in a single ```markdown fence (the
 * habit `stripMarkdownWrappers` exists to catch on the status-update route)
 * would otherwise have every `**` shown literally, since fenced content is
 * kept verbatim by design. Unwrap only when the fence spans the whole reply
 * and its info string names nothing executable, so a reply that is
 * legitimately explaining a code snippet keeps its fence.
 */
function unwrapWholeReplyFence(lines: string[]): string[] {
  let start = 0;
  let end = lines.length - 1;
  while (start <= end && lines[start].trim() === '') start += 1;
  while (end >= start && lines[end].trim() === '') end -= 1;
  if (end - start < 1) return lines;

  const openMatch = FENCE_LINE.exec(lines[start]);
  const closeMatch = FENCE_LINE.exec(lines[end]);
  if (!openMatch || !closeMatch) return lines;
  if (openMatch[2][0] !== closeMatch[2][0]) return lines;
  if (closeMatch[2].length < openMatch[2].length) return lines;
  if (closeMatch[3].trim() !== '') return lines;
  if (!UNWRAPPABLE_INFO.has(openMatch[3].trim().toLowerCase())) return lines;

  return lines.slice(start + 1, end);
}

// ---------------------------------------------------------------------------
// Line-level rules
// ---------------------------------------------------------------------------

const TABLE_SEPARATOR_ROW = /^[ \t]{0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const HEADING_LINE = /^[ \t]{0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/;
const BLOCKQUOTE_MARKER = /^[ \t]{0,3}>(?![ \t]*[\d=])[ \t]?/;
const BULLET_MARKER = /^([ \t]*)\*([ \t]+)/;

/** One line after block-level rules have run: `verbatim` lines (fence
 * content) skip inline parsing entirely; `forceBold` lines (headings) have
 * their inline-parsed segments all promoted to bold, since a bold word
 * inside a heading is no more or less bold than the rest of it. */
type ProcessedLine = { text: string; verbatim: boolean; forceBold: boolean };

/**
 * Turns raw lines into the lines that will actually be inline-parsed,
 * resolving fences, tables, horizontal rules, headings, blockquotes and
 * bullets. Manual index-based loop (not a for-of) because fences and tables
 * both need to consume more than one line per iteration.
 */
function processLines(rawLines: string[]): ProcessedLine[] {
  const out: Array<ProcessedLine | null> = [];
  let fence: { char: string; len: number } | null = null;
  let i = 0;

  while (i < rawLines.length) {
    const raw = rawLines[i];

    if (fence) {
      const closeMatch = FENCE_LINE.exec(raw);
      if (closeMatch && closeMatch[2][0] === fence.char && closeMatch[2].length >= fence.len) {
        fence = null;
        out.push(null);
      } else {
        out.push({ text: raw, verbatim: true, forceBold: false });
      }
      i += 1;
      continue;
    }

    const openMatch = FENCE_LINE.exec(raw);
    if (openMatch) {
      fence = { char: openMatch[2][0], len: openMatch[2].length };
      out.push(null);
      i += 1;
      continue;
    }

    if (HR_LINE.test(raw)) {
      out.push(null);
      i += 1;
      continue;
    }

    // Table: a header row containing `|`, followed by a matching separator
    // row with the SAME cell count. Anything less strict would misread
    // ordinary prose like "Setup | Pre-release" as a table.
    const next = rawLines[i + 1];
    if (next !== undefined && raw.includes('|') && next.includes('|') && TABLE_SEPARATOR_ROW.test(next)) {
      const headerCells = splitTableRow(raw);
      const sepCells = splitTableRow(next);
      if (headerCells.length === sepCells.length) {
        out.push({ text: headerCells.join(' · '), verbatim: false, forceBold: false });
        let j = i + 2;
        while (j < rawLines.length && rawLines[j].includes('|')) {
          const cells = splitTableRow(rawLines[j]);
          if (cells.length !== headerCells.length) break;
          out.push({ text: cells.join(' · '), verbatim: false, forceBold: false });
          j += 1;
        }
        i = j;
        continue;
      }
    }

    const headingMatch = HEADING_LINE.exec(raw);
    if (headingMatch) {
      const content = trimTrailingHashes(headingMatch[2] ?? '');
      out.push(content === '' ? null : { text: content, verbatim: false, forceBold: true });
      i += 1;
      continue;
    }

    let line = stripBlockquoteMarkers(raw);
    const bulletMatch = BULLET_MARKER.exec(line);
    if (bulletMatch) {
      line = `${bulletMatch[1]}- ${line.slice(bulletMatch[0].length)}`;
    }
    out.push({ text: line, verbatim: false, forceBold: false });
    i += 1;
  }

  return collapseBlankRuns(out);
}

/** Strips one or more leading `> ` markers (nested blockquotes), but leaves a
 * `>` alone when it is followed by a digit or `=` — "> 50% done" is a
 * sentence, not a quote. */
function stripBlockquoteMarkers(line: string): string {
  let out = line;
  let match = BLOCKQUOTE_MARKER.exec(out);
  while (match) {
    out = out.slice(match[0].length);
    match = BLOCKQUOTE_MARKER.exec(out);
  }
  return out;
}

/** A heading's trailing "closing sequence" (`## Title ##`) is trimmed by hand
 * rather than with a greedy regex tail, which is quadratic on a long run of
 * trailing spaces. */
function trimTrailingHashes(content: string): string {
  let end = content.length;
  while (end > 0 && (content[end - 1] === ' ' || content[end - 1] === '\t')) end -= 1;
  let hashEnd = end;
  while (hashEnd > 0 && content[hashEnd - 1] === '#') hashEnd -= 1;
  if (hashEnd < end && (hashEnd === 0 || content[hashEnd - 1] === ' ' || content[hashEnd - 1] === '\t')) {
    end = hashEnd;
    while (end > 0 && (content[end - 1] === ' ' || content[end - 1] === '\t')) end -= 1;
  }
  return content.slice(0, end).trim();
}

/** Splits a table row on unescaped `|`, trimming each cell and dropping a
 * leading/trailing empty cell produced by optional outer pipes. */
function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (line[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += line[i];
    }
  }
  cells.push(current.trim());
  if (cells.length > 1 && cells[0] === '') cells.shift();
  if (cells.length > 1 && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/** Removing a fence/rule/heading line must never leave a double blank line
 * behind, and a run of removed lines at the very start or end of the reply
 * must disappear rather than leaving stray blank lines. Also collapses any
 * run of genuinely blank lines the model wrote to a single blank line. */
function collapseBlankRuns(entries: Array<ProcessedLine | null>): ProcessedLine[] {
  const kept: ProcessedLine[] = [];
  let lastWasBlank = true; // true so a leading removed/blank line emits nothing
  for (const entry of entries) {
    if (entry === null) continue;
    const isBlank = entry.text.trim() === '';
    if (isBlank && lastWasBlank) continue;
    kept.push(entry);
    lastWasBlank = isBlank;
  }
  while (kept.length > 0 && kept[kept.length - 1].text.trim() === '') kept.pop();
  return kept;
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'text'; value: string }
  // A fully-resolved span (a link's label, recursively parsed) that carries
  // its own bold flag independent of the surrounding text — rendered as
  // `ownBold || (ambient depth > 0)`, so a plain label inside an outer
  // **bold** still renders bold, and a bold label outside one still does too.
  | { kind: 'resolved'; text: string; bold: boolean }
  | { kind: 'delim'; char: '*' | '_' | '~'; len: number; canOpen: boolean; canClose: boolean };

const ESCAPABLE = new Set([
  '\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!', '|', '~', '<', '>',
]);

// Trailing punctuation GitHub's own autolinker trims off a bare URL match, so
// a bold-wrapped or sentence-final URL doesn't swallow its own closing marker
// or full stop.
const URL_TRAILING_PUNCTUATION = /[.,:;!?'"*_~]+$/;

// Defensive cap on how far an inline-code search looks for a closing run,
// so a string of many stray backticks can't force an O(n²) scan.
const BACKTICK_SEARCH_LIMIT = 2000;

// Defensive cap on a link/image label's length, so a run of many `[`
// characters with no closing `]` can't force unbounded scanning per attempt.
const MAX_LABEL = 300;

function parseInline(text: string): MarkupSegment[] {
  const tokens = tokenize(text);
  return resolveAndRender(tokens);
}

/**
 * Left-to-right scan producing a flat token stream: literal text, resolved
 * spans (escapes, code, images, links, autolinks and bare URLs all resolve to
 * one of these — they are never re-examined by the emphasis pass), and
 * delimiter runs. Flanking is computed directly from the RAW STRING
 * characters immediately before/after a run — not from any token state — so
 * it matches CommonMark's own character-class-based definition regardless of
 * what construct produced the neighbouring text.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (ch === '\\' && i + 1 < n && ESCAPABLE.has(text[i + 1])) {
      tokens.push({ kind: 'text', value: text[i + 1] });
      i += 2;
      continue;
    }

    if (ch === '`') {
      const run = matchRun(text, i, '`');
      const closeIndex = findClosingBacktickRun(text, i + run.length, run.length);
      if (closeIndex !== -1) {
        let inner = text.slice(i + run.length, closeIndex);
        if (inner.length >= 2 && inner.startsWith(' ') && inner.endsWith(' ') && inner.trim() !== '') {
          inner = inner.slice(1, -1);
        }
        tokens.push({ kind: 'text', value: inner });
        i = closeIndex + run.length;
        continue;
      }
      tokens.push({ kind: 'text', value: run });
      i += run.length;
      continue;
    }

    if (ch === '!' && text[i + 1] === '[') {
      const image = matchLinkLike(text, i + 1);
      if (image) {
        tokens.push({ kind: 'text', value: unescapeLiteral(image.label) });
        i = image.end;
        continue;
      }
    }

    if (ch === '[') {
      const link = matchLinkLike(text, i);
      if (link) {
        for (const seg of parseInline(link.label)) {
          tokens.push({ kind: 'resolved', text: seg.text, bold: seg.bold });
        }
        const suffix = linkSuffix(unescapeLiteral(link.label), link.dest);
        if (suffix) tokens.push({ kind: 'text', value: suffix });
        i = link.end;
        continue;
      }
    }

    if (ch === '<') {
      const auto = matchAutolink(text, i);
      if (auto) {
        tokens.push({ kind: 'text', value: auto.value });
        i = auto.end;
        continue;
      }
    }

    if (ch === 'h' && (text.startsWith('http://', i) || text.startsWith('https://', i))) {
      const bare = matchBareUrl(text, i);
      if (bare) {
        tokens.push({ kind: 'text', value: bare.value });
        i = bare.end;
        continue;
      }
    }

    if (ch === '*' || ch === '_' || ch === '~') {
      const run = matchRun(text, i, ch);
      const validLen =
        ch === '*'
          ? run.length >= 1 && run.length <= 3
            ? run.length
            : 0
          : ch === '_'
            ? run.length === 1 || run.length === 2
              ? run.length
              : 0
            : run.length === 2
              ? 2
              : 0;
      if (validLen === 0) {
        tokens.push({ kind: 'text', value: run });
        i += run.length;
        continue;
      }
      const before = i > 0 ? text[i - 1] : '';
      const after = i + run.length < n ? text[i + run.length] : '';
      const flank = computeFlanking(ch, before, after);
      tokens.push({ kind: 'delim', char: ch, len: validLen, ...flank });
      i += run.length;
      continue;
    }

    // Ordinary text: consume up to the next character any branch above cares
    // about, so a run of plain prose becomes one token instead of one per
    // character. Always advances at least one character (the current one),
    // since reaching here means every special-case check above already
    // failed to match at position i.
    let j = i + 1;
    while (
      j < n &&
      !'\\`![<*_~'.includes(text[j]) &&
      !(text[j] === 'h' && (text.startsWith('http://', j) || text.startsWith('https://', j)))
    ) {
      j += 1;
    }
    tokens.push({ kind: 'text', value: text.slice(i, j) });
    i = j;
  }

  return tokens;
}

function matchRun(text: string, start: number, char: string): string {
  let end = start;
  while (end < text.length && text[end] === char) end += 1;
  return text.slice(start, end);
}

function findClosingBacktickRun(text: string, from: number, len: number): number {
  const limit = Math.min(text.length, from + BACKTICK_SEARCH_LIMIT);
  let i = from;
  while (i < limit) {
    if (text[i] === '`') {
      const run = matchRun(text, i, '`');
      if (run.length === len) return i;
      i += run.length;
    } else {
      i += 1;
    }
  }
  return -1;
}

const isSpace = (ch: string): boolean => ch === '' || /\s/.test(ch);
const isAlnum = (ch: string): boolean => ch !== '' && /[\p{L}\p{N}]/u.test(ch);

/**
 * `_` deliberately uses a STRICTER rule than full CommonMark, which also
 * treats punctuation (a quote, a period) as a valid flanking boundary — that
 * is exactly what makes a real CommonMark parser read `"__init__.wav"` as
 * emphasis around "init" (quote before the opener, period after the closer
 * both count as boundaries), silently eating the underscores off a dunder
 * filename. This assistant's replies are far more likely to contain a real
 * identifier like that than to actually mean "underline" by `__word__` — the
 * standard convention for emphasis here is `**word**` — so `_`/`__` only
 * counts as a delimiter when it sits against actual whitespace or a true
 * line boundary, never against punctuation alone. `*`/`~~` keep the wider,
 * CommonMark-style rule (punctuation flanking, not just whitespace), since
 * they don't collide with any common identifier convention.
 */
function computeFlanking(
  char: '*' | '_' | '~',
  before: string,
  after: string
): { canOpen: boolean; canClose: boolean } {
  if (char === '_') {
    const canOpen = isSpace(before) && !isSpace(after);
    const canClose = !isSpace(before) && isSpace(after);
    return { canOpen, canClose };
  }
  // '*' and '~' share the same rule.
  const canOpen = !isSpace(after) && !isAlnum(before);
  const canClose = !isSpace(before) && !isAlnum(after);
  return { canOpen, canClose };
}

// --- links / images / autolinks / bare urls -------------------------------

type LinkMatch = { label: string; dest: string; end: number };

/**
 * Matches `[label](dest)` or `[label](dest "title")` starting at a `[`. The
 * label may contain one nested, balanced `[...]`. The destination may
 * contain one level of balanced parentheses (so a Wikipedia-style URL with a
 * paren survives) and no unescaped whitespace. Capped label length keeps a
 * pathological `[[[[[...` input bounded per attempt.
 */
function matchLinkLike(text: string, openBracket: number): LinkMatch | null {
  let depth = 0;
  let i = openBracket;
  const labelStart = openBracket + 1;
  while (i < text.length && i - labelStart < MAX_LABEL + 50) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
    i += 1;
  }
  if (depth !== 0 || i >= text.length || text[i] !== ']') return null;
  const label = text.slice(labelStart, i);
  if (label.length > MAX_LABEL) return null;

  let j = i + 1;
  if (text[j] !== '(') return null;
  j += 1;
  const destStart = j;
  let parenDepth = 0;
  while (j < text.length) {
    const ch = text[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      if (parenDepth === 0) break;
      parenDepth -= 1;
    } else if (/\s/.test(ch) && parenDepth === 0) {
      break;
    }
    j += 1;
  }
  const dest = text.slice(destStart, j);
  if (dest === '') return null;

  // Optional " title" or 'title' — skip to the matching ')' without
  // capturing it.
  let k = j;
  while (k < text.length && /\s/.test(text[k])) k += 1;
  if (text[k] === '"' || text[k] === "'") {
    const quote = text[k];
    k += 1;
    while (k < text.length && text[k] !== quote) {
      if (text[k] === '\\') k += 1;
      k += 1;
    }
    k += 1;
  }
  while (k < text.length && /\s/.test(text[k])) k += 1;
  if (text[k] !== ')') return null;

  return { label, dest: unescapeLiteral(dest), end: k + 1 };
}

/** Whether/how to append the destination after a link's label, per the
 * founder call: an absolute http(s) URL is shown as "label (url)" unless the
 * label already says the same thing; a mailto: shows the bare address unless
 * redundant; anything else (an in-app path) shows only the label. */
function linkSuffix(label: string, dest: string): string {
  const trimmedDest = dest.trim();
  if (/^mailto:/i.test(trimmedDest)) {
    const address = trimmedDest.slice('mailto:'.length);
    return normalizeForCompare(label) === normalizeForCompare(address) ? '' : ` (${address})`;
  }
  if (/^https?:\/\//i.test(trimmedDest)) {
    return normalizeForCompare(label) === normalizeForCompare(trimmedDest) ? '' : ` (${trimmedDest})`;
  }
  return '';
}

function normalizeForCompare(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function unescapeLiteral(value: string): string {
  return value.replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1');
}

function matchAutolink(text: string, start: number): { value: string; end: number } | null {
  const match = /^<((?:https?|mailto):[^\s<>]+)>/i.exec(text.slice(start));
  if (!match) return null;
  const inner = match[1];
  const value = /^mailto:/i.test(inner) ? inner.slice('mailto:'.length) : inner;
  return { value, end: start + match[0].length };
}

function matchBareUrl(text: string, start: number): { value: string; end: number } | null {
  const match = /^https?:\/\/[^\s<>]+/.exec(text.slice(start));
  if (!match) return null;
  let raw = match[0];
  // Peel back trailing punctuation, and a trailing ')' that has no matching
  // '(' inside the URL, so "(see https://x.com/a)." keeps its own parens.
  while (raw.length > 0) {
    if (URL_TRAILING_PUNCTUATION.test(raw)) {
      raw = raw.replace(URL_TRAILING_PUNCTUATION, '');
      continue;
    }
    if (raw.endsWith(')') && (raw.match(/\(/g)?.length ?? 0) < (raw.match(/\)/g)?.length ?? 0)) {
      raw = raw.slice(0, -1);
      continue;
    }
    break;
  }
  if (raw === '') return null;
  return { value: raw, end: start + raw.length };
}

// --- delimiter pairing + rendering ------------------------------------------

type Pair = { openIndex: number; closeIndex: number; bold: boolean };

/**
 * Pairs delimiter runs left to right with one LIFO stack per character. `*`
 * follows the same "use 2 when both sides have >=2 left, else 1" rule
 * CommonMark uses, which is what makes `**Do this *today***` resolve as one
 * bold span rather than leaving a stray marker — a single closer run can
 * satisfy more than one opener, consuming part of its length against each in
 * turn. `_` and `~` never produce bold (the founder named double asterisks
 * specifically), so they always consume everything available in one step;
 * there is no styling distinction to get subtly wrong for them.
 *
 * An opener that is only partially consumed stays on the stack (not popped)
 * so a LATER closer can still use the rest of it — this is what lets a
 * single run be split across two different nestings without extra code.
 */
function pairDelimiters(tokens: Token[]): { pairs: Pair[]; remaining: Map<number, number> } {
  const stacks: Record<'*' | '_' | '~', number[]> = { '*': [], _: [], '~': [] };
  const remaining = new Map<number, number>();
  const pairs: Pair[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.kind !== 'delim') continue;
    remaining.set(i, tok.len);

    if (tok.canClose) {
      const stack = stacks[tok.char];
      while ((remaining.get(i) ?? 0) > 0 && stack.length > 0) {
        const openerIndex = stack[stack.length - 1];
        const openerLeft = remaining.get(openerIndex) ?? 0;
        if (openerLeft <= 0) {
          stack.pop();
          continue;
        }
        const closerLeft = remaining.get(i) ?? 0;
        const amount =
          tok.char === '*' ? (openerLeft >= 2 && closerLeft >= 2 ? 2 : 1) : Math.min(openerLeft, closerLeft);
        const bold = tok.char === '*' && amount === 2;
        pairs.push({ openIndex: openerIndex, closeIndex: i, bold });
        remaining.set(openerIndex, openerLeft - amount);
        remaining.set(i, closerLeft - amount);
        if ((remaining.get(openerIndex) ?? 0) <= 0) stack.pop();
      }
    }

    if (tok.canOpen && (remaining.get(i) ?? 0) > 0) {
      stacks[tok.char].push(i);
    }
  }

  return { pairs, remaining };
}

/**
 * Resolves pairs, then walks the token stream once, tracking a bold "depth"
 * that only bold pairs change (a plain/underscore/strikethrough pair just
 * removes its markers with no visual effect, so it never touches depth).
 *
 * A leftover, wholly-unconsumed run is either dropped or shown literally: a
 * length 2-3 `*` run that WAS a genuine opener candidate (space or line-start
 * before it) and never closed is the model's reply getting cut off mid-bold
 * — deleted, not shown as a stray `**`. Everything else unmatched (a lone
 * `*` in "*.wav", a run flanked by letters like "f**k") was never a
 * delimiter candidate to begin with and renders exactly as typed.
 */
function resolveAndRender(tokens: Token[]): MarkupSegment[] {
  const { pairs, remaining } = pairDelimiters(tokens);
  const boldOpensAt = new Map<number, number>();
  const boldClosesAt = new Map<number, number>();
  for (const pair of pairs) {
    if (!pair.bold) continue;
    boldOpensAt.set(pair.openIndex, (boldOpensAt.get(pair.openIndex) ?? 0) + 1);
    boldClosesAt.set(pair.closeIndex, (boldClosesAt.get(pair.closeIndex) ?? 0) + 1);
  }

  const out: MarkupSegment[] = [];
  let depth = 0;
  const emit = (value: string, ownBold: boolean) => {
    if (value === '') return;
    out.push({ text: value, bold: ownBold || depth > 0 });
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.kind === 'text') {
      emit(tok.value, false);
      continue;
    }
    if (tok.kind === 'resolved') {
      emit(tok.text, tok.bold);
      continue;
    }

    // delim token
    depth -= boldClosesAt.get(i) ?? 0;
    const left = remaining.get(i) ?? 0;
    if (left > 0) {
      const wasNeverTouched = left === tok.len;
      const isTruncatedBoldOpener = wasNeverTouched && tok.len >= 2 && tok.char === '*' && tok.canOpen;
      if (!isTruncatedBoldOpener) {
        emit(tok.char.repeat(left), false);
      }
    }
    depth += boldOpensAt.get(i) ?? 0;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Segment merging
// ---------------------------------------------------------------------------

function mergeSegments(segments: MarkupSegment[]): MarkupSegment[] {
  const out: MarkupSegment[] = [];
  for (const seg of segments) {
    if (seg.text === '') continue;
    const last = out[out.length - 1];
    if (last && last.bold === seg.bold) {
      last.text += seg.text;
    } else {
      out.push({ text: seg.text, bold: seg.bold });
    }
  }
  return out;
}
