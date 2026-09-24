'use client';

import { Fragment, useMemo } from 'react';
import { parseModelMarkup } from '@/lib/model-markup';
import { buildRevealGroups } from '@/lib/chappi/reveal-tokens';

/**
 * Renders an UrgAns reply's text: `**bold**` shows bold, every other
 * markdown symbol is removed (2026-09-24 founder call — see CLAUDE.md). Not
 * inlined into `ChappiConversation.tsx` so a throwaway harness page can
 * render it standalone for a visual check with no auth required.
 *
 * `useMemo` matters here specifically: `ChappiConversation` subscribes to
 * the whole Chappi store with no selector, and `input` (the composer text)
 * lives in that same store, so every keystroke re-renders every message in
 * the transcript. Re-parsing a long reply's markup on every keystroke would
 * be wasted work; memoizing on `content` means it only runs once per reply.
 */
export function ReplyText({ content, reveal }: { content: string; reveal: boolean }) {
  const segments = useMemo(() => parseModelMarkup(content), [content]);

  if (!reveal) {
    // The common case (a single plain segment, i.e. no markup at all) skips
    // wrapper elements entirely and renders the string exactly as before —
    // no behavior change for a reply UrgAns already writes cleanly.
    if (segments.length === 1 && !segments[0].bold) {
      return <>{segments[0].text}</>;
    }
    return (
      <>
        {segments.map((segment, index) =>
          segment.bold ? (
            <span key={index} className="font-semibold">
              {segment.text}
            </span>
          ) : (
            <Fragment key={index}>{segment.text}</Fragment>
          )
        )}
      </>
    );
  }

  const groups = buildRevealGroups(segments);
  return (
    <>
      {groups.map((group, groupIndex) => {
        const tokens = group.tokens.map(({ token, delay }, tokenIndex) =>
          delay === null ? (
            token
          ) : (
            <span key={tokenIndex} className="urgans-word" style={{ animationDelay: `${delay}ms` }}>
              {token}
            </span>
          )
        );
        // Wrapped per SEGMENT, not per word: with a bold `<span>` per WORD
        // instead, the plain spaces between bold words would render at their
        // un-bold (narrower) width during the reveal and jump to the bold
        // width once it settles, which can re-wrap a line. One wrapper per
        // segment — words and the whitespace between them together — keeps
        // that width constant from the first frame. A plain segment needs no
        // wrapping element at all (nothing about it changes width), so it
        // uses a keyed Fragment instead of a spare `<span>`.
        return group.bold ? (
          <span key={groupIndex} className="font-semibold">
            {tokens}
          </span>
        ) : (
          <Fragment key={groupIndex}>{tokens}</Fragment>
        );
      })}
    </>
  );
}
