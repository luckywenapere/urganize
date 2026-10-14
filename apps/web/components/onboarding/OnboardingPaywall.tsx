'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SELLING_INTERVAL,
  SALES_WHATSAPP_URL,
  type BillingInterval,
  type PricingTierId,
} from '@urganize/pricing';
import { MessageCircle } from '@/components/icons';
import { TierPlanPicker } from '@/components/billing/TierPlanPicker';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { openExternalUrl } from '@/lib/external-link';
import { isIOSApp } from '@/lib/platform';
import { TEAM_TRIAL_DAYS } from '@/lib/team-billing';
import type { OnboardingPersona, OnboardingWhereStuck } from '@/lib/onboarding';
import {
  PAYWALL_CHAT_LINE,
  PAYWALL_CTA,
  PAYWALL_HEADLINE,
  PAYWALL_LOGOS,
  PAYWALL_LOGOS_LINE,
  PAYWALL_TIERS,
  buildPaywallCards,
  paywallTierForPersona,
  paywallTrialLine,
  savePaywallPlanChoice,
} from '@/lib/onboarding-paywall';

/**
 * The paywall right after account creation (URG-251 Part 3). The only way
 * forward is "Start my free trial": no skip, no close, no back (the account
 * already exists). The trial is the existing 3-day team trial, no card,
 * already granted when the team was created, so the button records the plan
 * they picked (the billing wall opens on it later) and moves them on.
 *
 * Prices come from @urganize/pricing through TierPlanPicker, never typed here.
 * In the iPhone app no price is shown at all (App Store payment rules), the
 * same call the billing wall makes with isIOSApp().
 */
export function OnboardingPaywall({
  persona,
  whereStuck,
  startFromScratch,
  busy,
  onStartTrial,
}: {
  persona: OnboardingPersona | null;
  whereStuck: readonly OnboardingWhereStuck[];
  startFromScratch: boolean;
  busy: boolean;
  onStartTrial: () => void;
}) {
  const preselected = paywallTierForPersona(persona);
  const [tier, setTier] = useState<PricingTierId>(preselected);
  const [interval, setBillingInterval] = useState<BillingInterval>(DEFAULT_SELLING_INTERVAL);
  const [iosApp, setIosApp] = useState(false);
  const [activeCard, setActiveCard] = useState(0);
  const cards = useMemo(() => buildPaywallCards({ whereStuck, startFromScratch }), [whereStuck, startFromScratch]);
  const trackRef = useRef<HTMLDivElement>(null);
  const seenCardsRef = useRef<Set<number>>(new Set([0]));

  useEffect(() => {
    const ios = isIOSApp();
    setIosApp(ios);
    captureAnalyticsEvent({
      name: 'onboarding_paywall_viewed',
      properties: { preselected_tier: preselected, cards: cards.length, ios_app: ios },
    });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    if (index === activeCard || index < 0 || index >= cards.length) return;
    setActiveCard(index);
    if (!seenCardsRef.current.has(index)) {
      seenCardsRef.current.add(index);
      captureAnalyticsEvent({
        name: 'onboarding_paywall_card_swiped',
        properties: { index, card: cards[index].id },
      });
    }
  };

  const goToCard = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
  };

  const start = () => {
    if (busy) return;
    savePaywallPlanChoice({ tier, interval });
    captureAnalyticsEvent({
      name: 'onboarding_trial_started',
      properties: { tier, interval, changed_from_preselected: tier !== preselected },
    });
    onStartTrial();
  };

  return (
    <div className="mt-2 space-y-6">
      <h3 className="font-display text-2xl font-semibold leading-tight text-content-primary sm:text-3xl">
        {PAYWALL_HEADLINE}
      </h3>

      {/* The landing page's line and logos, never "Trusted by". */}
      <div>
        <p className="text-center text-xs text-content-tertiary">{PAYWALL_LOGOS_LINE}</p>
        <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {PAYWALL_LOGOS.map((logo) => {
            const shown = Math.round(logo.shown * 0.75);
            return (
              <li key={logo.name} className="flex items-center">
                <span
                  role="img"
                  aria-label={logo.name}
                  title={logo.name}
                  className="block bg-content-tertiary"
                  style={{
                    height: shown,
                    width: Math.round((shown * logo.width) / logo.height),
                    WebkitMaskImage: `url(${logo.src})`,
                    maskImage: `url(${logo.src})`,
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                  }}
                />
              </li>
            );
          })}
        </ul>
      </div>

      {/* Swipe-through cards, their own answer first. */}
      <div>
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-roledescription="carousel"
          aria-label="How Urganize helps"
        >
          {cards.map((card, index) => (
            <article
              key={card.id}
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${cards.length}`}
              className="w-full shrink-0 snap-center px-0.5"
            >
              <div className="h-full rounded-2xl border border-stroke-default bg-bg-elevated px-4 py-4">
                <p className="font-display text-lg font-semibold leading-snug text-content-primary">{card.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-content-secondary">{card.line}</p>
                {card.testimonial ? (
                  <figure className="mt-3 border-l-2 border-brand pl-3">
                    <blockquote className="text-sm italic leading-relaxed text-content-secondary">
                      &ldquo;{card.testimonial.quote}&rdquo;
                    </blockquote>
                    <figcaption className="mt-1 text-xs text-content-tertiary">
                      {card.testimonial.name}, {card.testimonial.role}
                    </figcaption>
                  </figure>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {cards.length > 1 ? (
          <div className="mt-3 flex justify-center gap-2" role="tablist" aria-label="Choose a card">
            {cards.map((card, index) => (
              <button
                key={card.id}
                type="button"
                role="tab"
                aria-selected={index === activeCard}
                aria-label={`Card ${index + 1}`}
                onClick={() => goToCard(index)}
                className={`h-2 rounded-full transition-all duration-fast ${
                  index === activeCard ? 'w-5 bg-brand' : 'w-2 bg-stroke-strong'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4 rounded-2xl border border-stroke-default bg-bg-surface px-4 py-4">
        {iosApp ? null : (
          <TierPlanPicker
            tiers={PAYWALL_TIERS}
            selectedTier={tier}
            onSelectTier={setTier}
            selectedInterval={interval}
            onSelectInterval={setBillingInterval}
            disabled={busy}
          />
        )}
        <p className="text-center text-sm text-content-secondary">
          {paywallTrialLine(TEAM_TRIAL_DAYS)} No card needed.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="motion-press inline-flex min-h-12 w-full items-center justify-center rounded-full bg-content-primary px-6 text-sm font-semibold text-content-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Starting…' : PAYWALL_CTA}
        </button>
        <button
          type="button"
          onClick={() => {
            captureAnalyticsEvent({ name: 'onboarding_paywall_chat', properties: {} });
            void openExternalUrl(SALES_WHATSAPP_URL);
          }}
          className="motion-focus mx-auto flex min-h-11 items-center gap-2 text-sm font-medium text-content-secondary underline-offset-4 hover:text-content-primary hover:underline"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          {PAYWALL_CHAT_LINE}
        </button>
      </div>
    </div>
  );
}
