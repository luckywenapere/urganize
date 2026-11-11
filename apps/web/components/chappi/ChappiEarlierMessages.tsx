'use client';

import { useState } from 'react';
import { ChappiBriefCard } from '@/components/chappi/ChappiBriefCard';
import { ChatDayLine } from '@/components/chappi/ChatDayLine';
import { dayLinesFor } from '@/lib/chappi/day-divider';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';
import type { ChappiMessage } from '@/lib/chappi/types';
import { loadEarlierPage, useChappiHistoryStore } from '@/stores/useChappiHistoryStore';
import { useChappiStore } from '@/stores/useChappiStore';

const HISTORY_ENABLED = isChappiHistoryEnabled();

/**
 * "Show earlier" at the top of the one Assistant chat (#1207). The chat keeps
 * its newest messages; older ones, and every old session folded in, live on
 * earlier pages that load here one at a time, newest first. Read only: nothing
 * here is ever saved back.
 *
 * Only on the one chat. A rollout's chat has no earlier pages.
 */
export function ChappiEarlierMessages() {
  const homeChatId = useChappiHistoryStore((state) => state.homeChatId);
  const conversationId = useChappiStore((state) => state.conversationId);
  const onMain = Boolean(HISTORY_ENABLED && homeChatId && conversationId === homeChatId);
  // Keyed by chat so moving to another chat starts over.
  return onMain ? <EarlierPages key={conversationId ?? ''} /> : null;
}

function EarlierPages() {
  const [older, setOlder] = useState<ChappiMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const showEarlier = async () => {
    setStatus('loading');
    const result = await loadEarlierPage(cursor);
    if (!result) {
      setStatus('error');
      return;
    }
    setOlder((current) => [...result.messages, ...current]);
    setCursor(result.nextCursor);
    setStatus(result.nextCursor ? 'idle' : 'done');
  };

  const lines = dayLinesFor(older);

  return (
    <div className="space-y-5">
      {status !== 'done' ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void showEarlier()}
            disabled={status === 'loading'}
            className="motion-focus motion-press inline-flex min-h-9 items-center rounded-full border border-stroke-strong px-3.5 text-xs font-medium text-content-secondary hover:text-content-primary disabled:opacity-60"
          >
            {status === 'loading' ? 'Loading…' : status === 'error' ? 'Could not load. Try again' : 'Show earlier'}
          </button>
        </div>
      ) : older.length === 0 ? null : (
        <p className="text-center text-xs text-content-tertiary">That is everything.</p>
      )}
      {older.map((message, index) => (
        <div key={`${message.id}-${index}`} className="space-y-5">
          {lines[index] ? <ChatDayLine label={lines[index] as string} /> : null}
          {message.kind === 'divider' ? (
            <p className="text-center text-xs text-content-tertiary">{message.content}</p>
          ) : message.kind === 'brief' && message.brief ? (
            <ChappiBriefCard brief={message.brief} />
          ) : message.role === 'user' ? (
            <div className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-brand/25 bg-brand/15 px-4 py-2.5 text-sm leading-6 text-content-primary">
                {message.content}
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words text-sm leading-7 text-content-primary">{message.content}</div>
          )}
        </div>
      ))}
    </div>
  );
}
