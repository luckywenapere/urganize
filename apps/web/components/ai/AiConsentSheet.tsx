'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from '@/components/icons';
import { Button } from '@urganize/ui';

import { DialogPanel } from '@/components/shared/DialogPanel';
import { AI_CONSENT_COPY, AI_CONSENT_EVENT, isAiConsentEnabled } from '@/lib/ai-consent';
import { useAuthStore } from '@/lib/auth-store';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useAiConsentStore } from '@/stores/useAiConsentStore';

/**
 * The one-time screen that asks before anything goes to an AI (Apple 5.1.2(i)).
 * Mounted once by AppShell. It opens when code calls ensureAiConsent(), and also
 * when a server refusal (403 ai_consent_required) reaches the browser's fetch
 * hook, so a path nobody wired up still asks instead of silently failing.
 *
 * Portalled to document.body (AppShell's lazy-fade transform breaks
 * `position: fixed` for descendants), body scroll locked while open. Escape and
 * a tap outside both mean "Not now".
 */
export function AiConsentSheet() {
  const open = useAiConsentStore((state) => state.open);
  const ask = useAiConsentStore((state) => state.ask);
  const answer = useAiConsentStore((state) => state.answer);
  const updateAiConsent = useAuthStore((state) => state.updateAiConsent);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // A server refusal opens the screen even when no code asked first.
  useEffect(() => {
    const onRefused = () => {
      void ask();
    };
    window.addEventListener(AI_CONSENT_EVENT, onRefused);
    return () => window.removeEventListener(AI_CONSENT_EVENT, onRefused);
  }, [ask]);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // `open` can only become true in the browser, so reading document here never
  // runs on the server.
  if (!isAiConsentEnabled() || !open) return null;

  const agree = async () => {
    setIsSaving(true);
    setError('');
    try {
      await updateAiConsent(true);
      answer(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[175] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) answer(false);
      }}
    >
      <DialogPanel
        label={AI_CONSENT_COPY.title}
        onClose={() => answer(false)}
        className="flex w-full max-w-md flex-col gap-4 rounded-t-2xl border-t border-stroke-strong bg-bg-surface p-6 shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] sm:rounded-2xl sm:border"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-xl text-content-primary">{AI_CONSENT_COPY.title}</h2>
        <div className="flex flex-col gap-3 text-sm leading-6 text-content-secondary">
          <p>{AI_CONSENT_COPY.intro}</p>
          <p>{AI_CONSENT_COPY.sends}</p>
          <p>{AI_CONSENT_COPY.limits}</p>
          <p>
            {AI_CONSENT_COPY.choice}{' '}
            <a
              href="https://urganize.app/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline text-content-primary"
            >
              Read the privacy policy
            </a>
            .
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-status-error">
            {error}
          </p>
        ) : null}
        <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => answer(false)} className="justify-center">
            {AI_CONSENT_COPY.decline}
          </Button>
          <Button
            type="button"
            onClick={() => void agree()}
            isLoading={isSaving}
            data-autofocus
            className="justify-center"
          >
            {AI_CONSENT_COPY.agree}
          </Button>
        </div>
      </DialogPanel>
    </div>,
    document.body
  );
}
