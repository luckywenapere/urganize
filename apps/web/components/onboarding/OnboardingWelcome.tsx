'use client';

import { useEffect } from 'react';
import { SALES_WHATSAPP_URL } from '@urganize/pricing';
import { Loader2, Sparkles } from '@/components/icons';
import { ContactIcon } from '@/components/app/BrandIcons';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { openExternalUrl } from '@/lib/external-link';
import { WELCOME_CTA, WELCOME_LINE, WELCOME_ROWS, WELCOME_TITLE } from '@/lib/onboarding-welcome';

/**
 * Welcome to Urganize (URG-251 Part 5). Shown once, between the paywall and
 * the team step. The two rows carry the icons the app itself uses: Sparkles is
 * the UrgAns tab on the phone and the UrgAns button on a computer; ContactIcon
 * is "Get help" in the help rows. "Talk to us" opens the same WhatsApp line
 * as the billing wall's "Talk to us".
 *
 * It opens nothing else: the first session's quiet (lib/first-session.ts)
 * starts after this screen, and nothing here touches the share sheet, tours
 * or the install card.
 */
export function OnboardingWelcome({
  busy,
  onGo,
  planBuilding = false,
}: {
  busy: boolean;
  onGo: () => void;
  /** The rollout's plan is building on the server (auto-plan, 2026-10-17). */
  planBuilding?: boolean;
}) {
  useEffect(() => {
    captureAnalyticsEvent({ name: 'onboarding_welcome_viewed', properties: {} });
  }, []);

  return (
    <div className="mt-2 space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/urganize-mark.png" alt="Urganize" width={56} height={56} className="h-14 w-14" />
        <h3 className="font-display text-2xl font-semibold leading-tight text-content-primary">{WELCOME_TITLE}</h3>
        <p className="text-sm leading-relaxed text-content-secondary">{WELCOME_LINE}</p>
        {planBuilding ? (
          <p
            role="status"
            className="inline-flex items-center gap-2.5 rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-sm text-content-primary"
          >
            <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
            Building your plan
          </p>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">What to look out for</p>
        <ul className="mt-3 space-y-2">
          <li className="flex items-start gap-3 rounded-xl border border-stroke-default bg-bg-elevated px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-content-inverse">
              <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-content-primary">{WELCOME_ROWS.urgans.title}</span>
              <span className="mt-0.5 block text-sm text-content-secondary">{WELCOME_ROWS.urgans.line}</span>
            </span>
          </li>
          <li>
            <button
              type="button"
              onClick={() => void openExternalUrl(SALES_WHATSAPP_URL)}
              className="motion-focus flex w-full items-start gap-3 rounded-xl border border-stroke-default bg-bg-elevated px-4 py-3 text-left hover:border-stroke-strong"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-surface text-content-primary ring-1 ring-stroke-default">
                <ContactIcon className="h-4.5 w-4.5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-content-primary">{WELCOME_ROWS.talk.title}</span>
                <span className="mt-0.5 block text-sm text-content-secondary">{WELCOME_ROWS.talk.line}</span>
              </span>
            </button>
          </li>
        </ul>
      </div>

      <button
        type="button"
        onClick={() => {
          if (busy) return;
          captureAnalyticsEvent({ name: 'onboarding_welcome_go', properties: {} });
          onGo();
        }}
        disabled={busy}
        className="motion-press inline-flex min-h-12 w-full items-center justify-center rounded-full bg-content-primary px-6 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'One moment…' : WELCOME_CTA}
      </button>
    </div>
  );
}
