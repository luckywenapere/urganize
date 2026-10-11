'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Send } from '@/components/icons';
import {
  EVERYONE_TOKEN,
  filterMentionOptions,
  findMentionQuery,
  insertMention,
  type ChatPerson,
} from '@/lib/chat-mentions';

type ThreadComposerProps = {
  onSend: (content: string) => Promise<void>;
  placeholder: string;
  /** Who can be tagged with @. Leave it out and the composer has no picker
   *  (the task chat does not email anyone, so it offers no tags). */
  mentionPeople?: ChatPerson[];
  /** Left out of the picker: you do not tag yourself. */
  currentUserId?: string | null;
};

type MentionState = { start: number; query: string };

/**
 * The compose box half of a thread — shared between the task and release
 * chat. Plain submit button rather than Enter-to-send: nothing else in this
 * codebase's text inputs intercepts Enter, and a chat composer that behaves
 * differently from every other multi-line field in the app is its own small
 * surprise.
 *
 * With `mentionPeople`, typing "@" opens a list of people to tag. It is a real
 * combobox: arrow keys move, Enter or Tab picks, Escape closes. Enter only
 * picks while the list is open, so it never sends. The text is the record:
 * picking a name just types "@Name " into the box, and the server reads the
 * tags from the text when the message is sent (lib/chat-mentions.ts).
 */
export function ThreadComposer({ onSend, placeholder, mentionPeople, currentUserId }: ThreadComposerProps) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [mention, setMention] = useState<MentionState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const listId = useId();

  const options = useMemo(
    () => (mention && mentionPeople ? filterMentionOptions(mentionPeople, mention.query, currentUserId ?? null) : []),
    [mention, mentionPeople, currentUserId]
  );
  const pickerOpen = Boolean(mentionPeople && mention && options.length > 0);
  const safeIndex = Math.min(activeIndex, Math.max(0, options.length - 1));

  const readMention = (text: string, caret: number | null) => {
    if (!mentionPeople) return;
    const next = caret === null ? null : findMentionQuery(text, caret);
    setMention(next);
    if (!next || next.query !== mention?.query) setActiveIndex(0);
  };

  const pick = (index: number) => {
    const option = options[index];
    if (!option || !mention) return;
    const label = option.kind === 'everyone' ? EVERYONE_TOKEN : option.person.name;
    const caret = textareaRef.current?.selectionStart ?? content.length;
    const next = insertMention(content, mention.start, caret, label);
    setContent(next.text);
    setMention(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!pickerOpen) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((safeIndex + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((safeIndex - 1 + options.length) % options.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      pick(safeIndex);
    } else if (event.key === 'Escape') {
      // Closes the list only; a dialog around this box keeps its own Escape.
      event.preventDefault();
      event.stopPropagation();
      setMention(null);
    }
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setError('');
    try {
      await onSend(trimmed);
      setContent('');
      setMention(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the message.');
    } finally {
      setIsSending(false);
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <div className="mt-4">
      <div className="relative flex items-end gap-2">
        {pickerOpen ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="People to tag"
            className="absolute bottom-full left-0 z-20 mb-2 max-h-56 w-full max-w-xs overflow-y-auto rounded-lg border border-stroke-default bg-bg-surface p-1 shadow-lg"
          >
            {options.map((option, index) => {
              const active = index === safeIndex;
              const label = option.kind === 'everyone' ? `@${EVERYONE_TOKEN}` : option.person.name;
              return (
                <li
                  key={option.kind === 'everyone' ? 'everyone' : option.person.userId}
                  id={optionId(index)}
                  role="option"
                  aria-selected={active}
                  // mousedown, not click: a click would blur the box first and
                  // lose the caret the name is inserted at.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(index);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex min-h-[40px] cursor-pointer flex-col justify-center rounded-md px-3 py-1.5 text-sm ${
                    active ? 'bg-brand/10 text-content-primary' : 'text-content-primary'
                  }`}
                >
                  <span className="font-medium">{label}</span>
                  {option.kind === 'everyone' ? (
                    <span className="text-xs text-content-secondary">Email everyone on this rollout</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            readMention(event.target.value, event.target.selectionStart);
          }}
          onSelect={(event) => readMention(event.currentTarget.value, event.currentTarget.selectionStart)}
          onKeyDown={handleKeyDown}
          onBlur={() => setMention(null)}
          placeholder={placeholder}
          aria-label="Message"
          {...(mentionPeople
            ? {
                role: 'combobox',
                'aria-autocomplete': 'list' as const,
                'aria-expanded': pickerOpen,
                'aria-controls': pickerOpen ? listId : undefined,
                'aria-activedescendant': pickerOpen ? optionId(safeIndex) : undefined,
              }
            : {})}
          rows={2}
          className="motion-focus min-h-[44px] w-full min-w-0 flex-1 resize-y rounded-lg border border-stroke-control bg-bg-surface px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!content.trim() || isSending}
          aria-label="Send"
          className="motion-focus motion-press inline-flex h-11 w-11 shrink-0 items-center justify-center border border-brand/25 bg-brand text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-status-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
