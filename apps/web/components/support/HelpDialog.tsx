'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2 } from '@/components/icons';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { useAuthStore } from '@/lib/auth-store';
import {
  HELP_MESSAGE_MAX,
  HELP_TOPICS,
  HELP_TOPIC_LABELS,
  parseHelpRequest,
  setupCallUrl,
  type HelpTopic,
} from '@/lib/self-serve';
import { useHelpStore } from '@/stores/useHelpStore';

/**
 * "Get help" (self-serve checkout, 2026-10-22). Pick what it is about, write
 * what's going on, send. The team, plan, page and version go with it, read on
 * the server, and the reply comes to the person's own email. Manager and Label
 * teams also see "Book a 15-minute setup call".
 *
 * Portals to document.body, owns Escape and uses the shared scroll lock, like
 * ReportIssueDialog.
 */

type Context = { email: string | null; offersCall: boolean };

export function HelpDialog() {
  const isOpen = useHelpStore((state) => state.isOpen);
  const closeHelp = useHelpStore((state) => state.closeHelp);
  const userId = useAuthStore((state) => state.user?.id ?? null);

  const [topic, setTopic] = useState<HelpTopic | null>(null);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [context, setContext] = useState<Context | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Reset on (re)open at render time, the ReportIssueDialog pattern.
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setTopic(null);
      setMessage('');
      setError('');
      setIsSent(false);
    }
  }

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch('/api/help', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }).catch(() => null);
      if (!response?.ok || cancelled) return;
      const payload = (await response.json().catch(() => null)) as Context | null;
      if (payload && !cancelled) {
        setContext({ email: payload.email ?? null, offersCall: Boolean(payload.offersCall) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSending) closeHelp();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeHelp, isOpen, isSending]);

  useEffect(() => {
    if (!isOpen) return;
    return lockBodyScroll();
  }, [isOpen]);

  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen && isMounted, panelRef, {
    onBackClose: () => {
      if (!isSending) closeHelp();
    },
  });

  if (!isOpen || !isMounted) return null;

  const pickTopic = (next: HelpTopic) => {
    setTopic(next);
    setError('');
    captureAnalyticsEvent(createPostHogEvent('help_topic_selected', { topic: next }), { userId });
    window.setTimeout(() => messageRef.current?.focus(), 0);
  };

  const send = async () => {
    const pagePath = `${window.location.pathname}${window.location.search}`;
    const parsed = parseHelpRequest({ topic, message, pagePath });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setIsSending(true);
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Sign in again.');
      const response = await fetch('/api/help', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.value),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not send that. Try again.');
      setIsSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send that. Try again.');
    } finally {
      setIsSending(false);
    }
  };

  const callUrl = context?.offersCall ? setupCallUrl() : null;
  const callLink = callUrl ? (
    <a
      href={callUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => captureAnalyticsEvent(createPostHogEvent('setup_call_clicked', { source: 'help' }), { userId })}
      className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
    >
      Book a 15-minute setup call
    </a>
  ) : null;

  const dialog = (
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-end justify-center bg-black/72 backdrop-blur-sm sm:items-center sm:px-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close help"
        tabIndex={-1}
        className="absolute inset-0"
        onClick={() => {
          if (!isSending) closeHelp();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        className="relative w-full max-w-lg rounded-t-3xl border border-stroke-default bg-bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-6"
      >
        {isSent ? (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/12 text-brand">
              <Check className="h-5 w-5" />
            </div>
            <h2 id="help-dialog-title" className="mt-3 font-display text-xl text-content-primary">
              Sent. We&apos;ll reply soon.
            </h2>
            {context?.email ? (
              <p className="mt-2 text-sm text-content-secondary">The reply goes to {context.email}.</p>
            ) : null}
            <div className="mt-5 flex items-center justify-between gap-3">
              {callLink ?? <span />}
              <button
                type="button"
                onClick={closeHelp}
                className="min-h-11 rounded-full border border-stroke-control px-5 text-sm font-semibold text-content-primary hover:bg-bg-hover"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h2 id="help-dialog-title" className="font-display text-xl text-content-primary">
                What do you need help with?
              </h2>
              <button
                type="button"
                onClick={closeHelp}
                aria-label="Close help"
                className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-content-tertiary hover:bg-bg-hover hover:text-content-primary"
              >
                ×
              </button>
            </div>
            <div role="radiogroup" aria-label="What it is about" className="mt-4 flex flex-wrap gap-2">
              {HELP_TOPICS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={topic === option}
                  onClick={() => pickTopic(option)}
                  className={`min-h-11 rounded-full border px-4 text-sm font-medium transition ${
                    topic === option
                      ? 'border-brand bg-brand/10 text-content-primary'
                      : 'border-stroke-control text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {HELP_TOPIC_LABELS[option]}
                </button>
              ))}
            </div>
            <label className="mt-4 block">
              <span className="sr-only">Your message</span>
              <textarea
                ref={messageRef}
                value={message}
                maxLength={HELP_MESSAGE_MAX}
                rows={5}
                placeholder="Tell us what's going on"
                onChange={(event) => setMessage(event.target.value)}
                className="w-full resize-none rounded-2xl border border-stroke-control bg-bg-base px-4 py-3 text-base text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none"
              />
            </label>
            <p className="mt-2 text-sm text-content-tertiary">
              {context?.email ? `We reply to ${context.email}. ` : ''}Your team, plan and page are attached.
            </p>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-status-error">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              {callLink ?? <span className="hidden sm:block" />}
              <button
                type="button"
                onClick={() => void send()}
                disabled={isSending}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-content-inverse disabled:opacity-60"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
