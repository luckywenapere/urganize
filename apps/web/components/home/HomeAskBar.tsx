'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Sparkles } from '@/components/icons';
import { useChappiStore } from '@/stores/useChappiStore';

/**
 * A real chat box on Home, just above the fold button. Search lives in the top
 * bar, so this one only talks to UrgAns: send a message and the conversation
 * opens (the drawer on a desktop, the full page on a phone) with that message
 * already sent. It stands in for the floating UrgAns button, which is hidden on
 * Home.
 */
export function HomeAskBar() {
  const router = useRouter();
  const setInput = useChappiStore((state) => state.setInput);
  const setSendInputOnOpen = useChappiStore((state) => state.setSendInputOnOpen);
  const setRailOpen = useChappiStore((state) => state.setRailOpen);
  const [text, setText] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput(trimmed);
    setSendInputOnOpen(true);
    setText('');
    if (window.matchMedia('(min-width: 1024px)').matches) setRailOpen(true);
    else router.push('/dashboard/urgans');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-16 w-full items-center gap-3 rounded-full border border-stroke-control bg-bg-surface pl-5 pr-2 focus-within:border-content-secondary"
    >
      <Sparkles className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ask UrgAns anything"
        aria-label="Message UrgAns"
        enterKeyHint="send"
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-base text-content-primary placeholder:text-content-tertiary focus:outline-none"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        aria-label="Send to UrgAns"
        className="motion-focus grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-content-inverse disabled:opacity-40"
      >
        <Send className="h-5 w-5" aria-hidden="true" />
      </button>
    </form>
  );
}
