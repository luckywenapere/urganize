'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import { isInFirstSession } from '@/lib/first-session';
import {
  ONBOARDING_PERSONA_CHOICES,
  ONBOARDING_PERSONA_LABELS,
  type OnboardingPersona,
} from '@/lib/onboarding';
import { markPersonaAskSettled, needsPersonaAnswer, readPersonaAskSettled } from '@/lib/persona-ask';

const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

/** Home settles first. Shorter than the NPS card's wait, so the two never race. */
const SHOW_AFTER_MS = 3000;

/**
 * "Who are you?" once, for an account with no answer (URG-262, 2026-10-14).
 * Who is asked: lib/persona-ask.ts. Mounted on Home beside NpsPrompt and kept
 * to its rules: non-modal, the same corner, never on top of another prompt or
 * pop-up, and never in the first session after onboarding. It is marked as a
 * dialog so the NPS card, which stays away while one is open, waits its turn.
 *
 * One tap answers (saved as onboarding_persona; the account's role is never
 * changed from here). Closing is one tap. Either is final on this device.
 */
export function PersonaAskCard() {
  const user = useAuthStore((state) => state.user);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const userId = user?.id ?? null;
  const owed = needsPersonaAnswer(user);

  useEffect(() => {
    if (!owed || !userId) return;
    if (readPersonaAskSettled(userId) || isInFirstSession()) return;
    const timer = setTimeout(() => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"], .nps-prompt')) return;
      if (document.visibilityState !== 'visible') return;
      setVisible(true);
    }, SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [owed, userId]);

  if (!visible || !userId) return null;

  const close = () => {
    setVisible(false);
    markPersonaAskSettled(userId, 'closed');
  };

  const pick = async (persona: OnboardingPersona) => {
    if (saving) return;
    setSaving(true);
    markPersonaAskSettled(userId, 'answered');
    setVisible(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const response = await fetch('/api/user/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ onboardingPersona: persona }),
      });
      if (response.ok) await checkAuth({ force: true });
    } catch {
      // A lost answer is not worth interrupting Home for.
    }
  };

  const bottomClass = MOBILE_NAV_ENABLED
    ? 'mobile-nav-raise-card lg:bottom-6'
    : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-6';

  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="persona-ask-title"
      className={`fixed inset-x-3 z-[140] sm:left-auto sm:right-6 sm:w-[22rem] ${bottomClass}`}
    >
      <div className="rounded-2xl border border-stroke-default bg-bg-surface p-4 shadow-[0_24px_70px_-40px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))]">
        <div className="flex items-start gap-3">
          <p id="persona-ask-title" className="min-w-0 flex-1 text-sm font-semibold leading-6 text-content-primary">
            Who are you?
          </p>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="hit-44 relative motion-focus motion-press -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div role="group" aria-labelledby="persona-ask-title" className="mt-3 flex flex-wrap gap-2">
          {ONBOARDING_PERSONA_CHOICES.map((persona) => (
            <button
              key={persona}
              type="button"
              disabled={saving}
              onClick={() => void pick(persona)}
              className="motion-focus motion-press rounded-full border border-stroke-default bg-bg-elevated px-3 py-1.5 text-sm text-content-primary transition-colors hover:border-brand hover:bg-brand/15 disabled:opacity-60"
            >
              {ONBOARDING_PERSONA_LABELS[persona]}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
