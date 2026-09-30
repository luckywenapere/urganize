// Plain text in, email paragraphs out. Pure, React-free and I/O-free.
//
// Two things are written this way: the onboarding sequence's copy
// (onboarding-sequence.ts) and whatever the founder types into the admin
// composer. Both are prose a person writes in a text box, so the format is the
// one people already type without being taught:
//
//   * a blank line starts a new paragraph;
//   * a single line break stays a line break (a short list, a sign-off);
//   * [some words](https://example.com) is a link, and so is a bare https URL.
//
// Only http(s) and mailto links are ever made. Anything else stays as the words
// the person typed, so a pasted `javascript:` link can never become a link in an
// email. React escapes the text itself when the template renders it.

export type NoteSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'break' };

export type NoteParagraph = NoteSegment[];

const MARKDOWN_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const BARE_URL = /https?:\/\/[^\s<>()]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?'"’”]+$/;

export function isSafeNoteHref(href: string): boolean {
  return /^(https?:\/\/\S+|mailto:\S+)$/i.test(href.trim());
}

function linkBareUrls(text: string): NoteSegment[] {
  const out: NoteSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(BARE_URL)) {
    const start = match.index ?? 0;
    const url = match[0].replace(TRAILING_PUNCTUATION, '');
    if (!url || !isSafeNoteHref(url)) continue;
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) });
    out.push({ kind: 'link', text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

function parseLine(line: string): NoteSegment[] {
  const out: NoteSegment[] = [];
  let last = 0;
  for (const match of line.matchAll(MARKDOWN_LINK)) {
    const start = match.index ?? 0;
    const [whole, label, href] = match;
    if (!isSafeNoteHref(href)) continue; // left in place, read as plain words below
    if (start > last) out.push(...linkBareUrls(line.slice(last, start)));
    out.push({ kind: 'link', text: label.trim(), href: href.trim() });
    last = start + whole.length;
  }
  if (last < line.length) out.push(...linkBareUrls(line.slice(last)));
  return out;
}

/** Adjacent text pieces become one, so a refused link reads as one run of words. */
function mergeText(segments: NoteSegment[]): NoteSegment[] {
  const out: NoteSegment[] = [];
  for (const segment of segments) {
    const previous = out[out.length - 1];
    if (segment.kind === 'text' && previous?.kind === 'text') {
      previous.text += segment.text;
    } else if (segment.kind !== 'text' || segment.text.length > 0) {
      out.push(segment.kind === 'text' ? { ...segment } : segment);
    }
  }
  return out;
}

export function parseNoteText(input: string): NoteParagraph[] {
  const normalised = String(input || '').replace(/\r\n?/g, '\n');
  return normalised
    .split(/\n[ \t]*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    )
    .filter((lines) => lines.length > 0)
    .map((lines) =>
      mergeText(
        lines.flatMap((line, index) =>
          index === 0 ? parseLine(line) : [{ kind: 'break' } as const, ...parseLine(line)]
        )
      )
    );
}

/** The plain-text version, for a preview line or a log. Links read as
 *  "words (url)" unless the words already are the url. */
export function noteTextToPlain(input: string): string {
  return parseNoteText(input)
    .map((paragraph) =>
      paragraph
        .map((segment) => {
          if (segment.kind === 'break') return '\n';
          if (segment.kind === 'link') {
            return segment.text === segment.href ? segment.href : `${segment.text} (${segment.href})`;
          }
          return segment.text;
        })
        .join('')
    )
    .join('\n\n');
}
