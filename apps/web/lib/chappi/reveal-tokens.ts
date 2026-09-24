// Word-by-word reveal tokenizer for a newly-arrived UrgAns reply, extracted
// out of ChappiConversation.tsx so it can carry a bold flag per group without
// the component needing its own word-counting state. Pure — no React.

import type { MarkupSegment } from '@/lib/model-markup';

// Per-word stagger for the reveal. The delay is capped so a long answer's
// tail never keeps the user waiting — everything past the cap fades in
// together, which reads as the stream "catching up".
export const REVEAL_WORD_STAGGER_MS = 24;
export const REVEAL_MAX_DELAY_MS = 1400;

export type RevealToken = { token: string; delay: number | null };
export type RevealGroup = { bold: boolean; tokens: RevealToken[] };

/**
 * Tokenizes a reply's already-parsed segments for the reveal: whitespace runs
 * (spaces, newlines) get `delay: null` and render as bare text nodes so
 * `whitespace-pre-wrap` line breaks survive untouched; word tokens carry a
 * staggered delay. One word counter runs across ALL segments (not reset per
 * segment), so a bold phrase in the middle of a reply reveals at the point
 * its words would have reached anyway — the reveal timing doesn't care where
 * the bold/plain boundaries fall.
 */
export function buildRevealGroups(segments: MarkupSegment[]): RevealGroup[] {
  let wordIndex = 0;
  return segments.map((segment) => {
    const tokens = segment.text
      .split(/(\s+)/)
      .filter((token) => token !== '')
      .map((token): RevealToken => {
        if (/^\s+$/.test(token)) return { token, delay: null };
        const delay = Math.min(wordIndex * REVEAL_WORD_STAGGER_MS, REVEAL_MAX_DELAY_MS);
        wordIndex += 1;
        return { token, delay };
      });
    return { bold: segment.bold, tokens };
  });
}
