'use client';

import { useState } from 'react';
import { Loader2, Send } from '@/components/icons';

type ThreadComposerProps = {
  onSend: (content: string) => Promise<void>;
  placeholder: string;
};

/**
 * The compose box half of a thread — shared between the task and release
 * chat. Plain submit button rather than Enter-to-send: nothing else in this
 * codebase's text inputs intercepts Enter, and a chat composer that behaves
 * differently from every other multi-line field in the app is its own small
 * surprise.
 */
export function ThreadComposer({ onSend, placeholder }: ThreadComposerProps) {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setError('');
    try {
      await onSend(trimmed);
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the message.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={placeholder}
          aria-label="Message"
          rows={2}
          className="motion-focus min-h-[44px] w-full flex-1 resize-y rounded-lg border border-stroke-control bg-bg-surface px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!content.trim() || isSending}
          aria-label="Send"
          className="motion-focus motion-press inline-flex h-10 w-10 shrink-0 items-center justify-center border border-brand/25 bg-brand text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
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
