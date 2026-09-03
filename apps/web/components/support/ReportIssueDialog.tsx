'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { Button } from '@urganize/ui';
import { getAccessToken } from '@/components/settings/getAccessToken';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import {
  ISSUE_KINDS,
  MAX_ISSUE_BODY_LENGTH,
  MAX_ISSUE_TITLE_LENGTH,
  validateIssueReport,
  type IssueKind,
} from '@/lib/issue-reports';
import { useReportIssueStore } from '@/stores/useReportIssueStore';

/**
 * Report a bug or make a request, from inside the app.
 *
 * Mounted ONCE by AppShell and opened through useReportIssueStore, because its
 * two entry points — the `?` HelpMenu and Settings → Account — live in
 * different ownership islands.
 *
 * Structure copied from DeleteReleaseDialog: portal to document.body (AppShell's
 * `lazy-fade` wrapper carries a transform that breaks `position: fixed` for
 * descendants), backdrop, Escape, and the shared ref-counted scroll lock. It IS
 * a real modal, so unlike the UrgAns rail it owns Escape.
 *
 * The submit reads its context from the live URL rather than from props: this
 * is mounted app-wide and must report the page the user is actually on.
 */

const KIND_COPY: Record<IssueKind, { label: string; hint: string; titleHint: string }> = {
  bug: {
    label: 'Something is broken',
    hint: 'What happened, and what did you expect instead?',
    titleHint: 'e.g. Cover art will not upload',
  },
  request: {
    label: 'I have a request',
    hint: 'What would you like to be able to do?',
    titleHint: 'e.g. Assign several activities at once',
  },
};

export function ReportIssueDialog() {
  const isOpen = useReportIssueStore((state) => state.isOpen);
  const initialKind = useReportIssueStore((state) => state.kind);
  const closeReportIssue = useReportIssueStore((state) => state.closeReportIssue);

  const [kind, setKind] = useState<IssueKind>(initialKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Reset on (re)open at render time with a prev guard, rather than in an
  // effect — the DeleteReleaseDialog pattern, and it keeps this off the
  // set-state-in-effect count.
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setKind(initialKind);
      setTitle('');
      setBody('');
      setError('');
      setReference(null);
      setIsSent(false);
    }
  }

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSending) closeReportIssue();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeReportIssue, isOpen, isSending]);

  useEffect(() => {
    if (!isOpen) return;
    return lockBodyScroll();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isSent) return;
    titleRef.current?.focus();
  }, [isOpen, isSent]);

  if (!isOpen || !isMounted) return null;

  const handleSubmit = async () => {
    const validated = validateIssueReport({ kind, title, body });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    setIsSending(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Session expired. Sign in again.');

      const response = await fetch('/api/issue-reports', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...validated.value,
          // The two facts only the browser knows. Everything identifying is
          // resolved server-side from the session.
          pagePath: `${window.location.pathname}${window.location.search}`,
          releaseId: new URLSearchParams(window.location.search).get('release'),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        reference?: string | null;
      };

      if (!response.ok) throw new Error(payload.error || 'Could not send that. Try again.');

      setReference(payload.reference ?? null);
      setIsSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send that. Try again.');
    } finally {
      setIsSending(false);
    }
  };

  const copy = KIND_COPY[kind];

  const dialog = (
    <div
      className="fixed inset-x-0 top-0 z-[220] flex h-[100dvh] items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-sm sm:py-8"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close report dialog"
        className="absolute inset-0"
        onClick={() => {
          if (!isSending) closeReportIssue();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-issue-title"
        className="relative mx-auto w-full max-w-lg border border-stroke-default bg-bg-surface shadow-[0_30px_90px_-46px_rgb(var(--shadow-ink)/calc(0.76*var(--shadow-alpha-scale)))]"
      >
        {isSent ? (
          <div className="p-5 sm:p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/12 text-brand">
              <Check className="h-5 w-5" />
            </div>
            <h2
              id="report-issue-title"
              className="mt-3 font-display text-xl font-semibold text-content-primary"
            >
              We have got it.
            </h2>
            <p className="mt-2 text-sm leading-6 text-content-secondary">
              {reference
                ? `Filed as ${reference}. We will pick it up from here.`
                : 'It is saved and on our list. We will pick it up from here.'}
            </p>
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={closeReportIssue}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                Report
              </p>
              <h2
                id="report-issue-title"
                className="mt-2 font-display text-xl font-semibold leading-snug text-content-primary"
              >
                Tell us what is going on
              </h2>

              <div
                role="radiogroup"
                aria-label="What kind of report is this?"
                className="mt-4 grid gap-2 sm:grid-cols-2"
              >
                {ISSUE_KINDS.map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                      kind === option
                        ? 'border-brand bg-brand/8 text-content-primary'
                        : 'border-stroke-default text-content-secondary hover:border-stroke-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-kind"
                      value={option}
                      checked={kind === option}
                      onChange={() => setKind(option)}
                      className="h-4 w-4 accent-[rgb(var(--color-brand))]"
                    />
                    <span>{KIND_COPY[option].label}</span>
                  </label>
                ))}
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-medium text-content-secondary">In one line</span>
                <input
                  ref={titleRef}
                  type="text"
                  value={title}
                  maxLength={MAX_ISSUE_TITLE_LENGTH}
                  placeholder={copy.titleHint}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-stroke-default bg-bg-base px-3 py-2.5 text-content-primary placeholder:text-content-quaternary focus:border-brand focus:outline-none"
                />
              </label>

              <label className="mt-3 block">
                <span className="text-xs font-medium text-content-secondary">{copy.hint}</span>
                <textarea
                  value={body}
                  rows={5}
                  maxLength={MAX_ISSUE_BODY_LENGTH}
                  onChange={(event) => setBody(event.target.value)}
                  className="mt-1.5 w-full resize-y rounded-lg border border-stroke-default bg-bg-base px-3 py-2.5 text-content-primary placeholder:text-content-quaternary focus:border-brand focus:outline-none"
                />
              </label>

              <p className="mt-2 text-xs leading-5 text-content-tertiary">
                We attach the page you are on, your name and email, and your team so we can follow
                up.
              </p>
            </div>

            {error ? (
              <div className="mx-5 mb-4 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-3 text-sm text-status-error sm:mx-6">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-stroke-subtle p-4 sm:px-6">
              <Button variant="ghost" onClick={closeReportIssue} disabled={isSending}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSending}>
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending
                  </>
                ) : (
                  'Send it'
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
