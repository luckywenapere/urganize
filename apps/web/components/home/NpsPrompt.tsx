'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import {
  NPS_HIGH_LABEL,
  NPS_LOW_LABEL,
  NPS_QUESTION,
  NPS_REASON_MAX_LENGTH,
  npsFollowUpQuestion,
} from '@/lib/nps';

const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

/** Home has to have been on screen this long, untouched by other prompts. */
const SHOW_AFTER_MS = 6000;
const THANKS_VISIBLE_MS = 2200;
const SCORES = Array.from({ length: 11 }, (_, index) => index);

type Phase = 'score' | 'reason' | 'thanks';

async function post(body: Record<string, unknown>): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return false;
    const response = await fetch('/api/nps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The Net Promoter Score ask (2026-10-11). Mounted once on Home; WHO gets it
 * and WHEN is decided by the server (GET /api/nps, rules in lib/nps.ts), so
 * this component only decides whether the screen is calm enough right now.
 *
 * Rules this surface keeps:
 *  - Non-modal. A small card in the corner on a computer, above the UrgAns box
 *    on a phone. Home stays fully usable underneath; nothing is blocked.
 *  - Never stacks on another prompt: if any dialog (install, notifications,
 *    the task check-in, a pop-up) is open when it would appear, it stays away
 *    this visit and is not counted as shown.
 *  - One tap on a number saves the score. The follow-up question is optional
 *    and its wording depends on the score.
 *  - Closing is one tap and records a close, which backs it off for a month.
 */
export function NpsPrompt() {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>('score');
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const answered = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token || cancelled) return;
        const response = await fetch('/api/nps', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok || cancelled) return;
        const payload = (await response.json().catch(() => null)) as { eligible?: boolean } | null;
        if (!payload?.eligible || cancelled) return;

        timer = setTimeout(() => {
          if (cancelled) return;
          // Another prompt or pop-up owns the moment: stay away this visit.
          if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
          if (document.visibilityState !== 'visible') return;
          setVisible(true);
          void post({ action: 'shown' });
        }, SHOW_AFTER_MS);
      } catch {
        // Never let the survey affect Home.
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'thanks') return;
    const timer = setTimeout(() => setVisible(false), THANKS_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const close = useCallback(() => {
    setVisible(false);
    // A close after a score is not a dismissal: the score is already saved.
    if (!answered.current) void post({ action: 'dismiss' });
  }, []);

  const pickScore = useCallback((value: number) => {
    answered.current = true;
    setScore(value);
    setPhase('reason');
    void post({ action: 'score', score: value, surface: 'home' });
  }, []);

  const sendReason = useCallback(() => {
    const trimmed = reason.trim();
    setPhase('thanks');
    if (trimmed) void post({ action: 'reason', reason: trimmed });
  }, [reason]);

  // `visible` only turns true inside a browser timer, so document exists here.
  if (!visible) return null;

  const bottomClass = MOBILE_NAV_ENABLED
    ? 'mobile-nav-raise-card lg:bottom-6'
    : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-6';

  return createPortal(
    <section
      aria-labelledby="nps-prompt-title"
      className={`nps-prompt fixed inset-x-3 z-[140] sm:left-auto sm:right-6 sm:w-[24rem] ${bottomClass}`}
    >
      <div className="rounded-2xl border border-stroke-default bg-bg-surface p-4 shadow-[0_24px_70px_-40px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))]">
        <div className="flex items-start gap-3">
          <p id="nps-prompt-title" className="min-w-0 flex-1 text-sm font-semibold leading-6 text-content-primary">
            {phase === 'score'
              ? NPS_QUESTION
              : phase === 'reason' && score !== null
                ? npsFollowUpQuestion(score)
                : 'Thank you. This helps us make Urganize better.'}
          </p>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="motion-focus motion-press -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {phase === 'score' ? (
          <div className="mt-3">
            <div className="grid grid-cols-11 gap-1" role="group" aria-label="Score from 0 to 10">
              {SCORES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => pickScore(value)}
                  aria-label={`${value} out of 10`}
                  className="motion-focus motion-press grid h-9 place-items-center rounded-lg border border-stroke-default bg-bg-elevated text-sm font-semibold tabular-nums text-content-primary transition-colors hover:border-brand hover:bg-brand/15"
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-content-tertiary">
              <span>{NPS_LOW_LABEL}</span>
              <span>{NPS_HIGH_LABEL}</span>
            </div>
          </div>
        ) : null}

        {phase === 'reason' ? (
          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              sendReason();
            }}
          >
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, NPS_REASON_MAX_LENGTH))}
              rows={3}
              autoFocus
              placeholder="Optional"
              aria-label="Tell us why"
              className="w-full resize-none rounded-xl border border-stroke-control bg-bg-elevated px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:border-brand/70 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPhase('thanks')}
                className="motion-focus rounded-lg px-3 py-2 text-sm text-content-secondary hover:text-content-primary"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={!reason.trim()}
                className="motion-focus motion-press rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse transition-opacity disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        ) : null}

        {phase === 'thanks' ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-content-secondary">
            <Check className="h-4 w-4 text-brand" aria-hidden="true" />
            <span>Your answer is saved.</span>
          </div>
        ) : null}
      </div>
    </section>,
    document.body
  );
}
