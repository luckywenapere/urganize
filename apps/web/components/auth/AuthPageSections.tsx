'use client';

// The three sections under the sign-in card on /auth (#1053, mock approved
// 3 Nov 2026): the plans, three questions and the footer. Laid out after a
// reference login page; Urganize's own words, type and colours.
//
// The plans read everything from @urganize/pricing (prices, the first month
// offer, limits and the outcome lines) and draw the same PlanPicture as
// urganize.app/pricing, so this page and /pricing cannot disagree. Sign-up is
// closed, so every plan button goes to the waitlist, never to checkout.

import { useState } from 'react';
import { CANONICAL_DESCRIPTION } from '@/lib/positioning';
import {
  TIER_GROUPS,
  TIER_GROUP_LABEL,
  TIER_GROUP_ORDER,
  formatTierFromPrice,
  getIntroPrice,
  getTier,
  formatMoney,
  getTierPrice,
  getTierPriceIn,
  introThenLine,
  tierOutcomes,
  type PricingCurrencyCode,
  type PricingTierId,
} from '@urganize/pricing';
import { PlanPicture } from '@urganize/ui/PlanPicture';
import { SiInstagram, SiTiktok, SiX, SiYoutube } from 'react-icons/si';
import { FaLinkedin } from 'react-icons/fa6';
import { Check, ChevronRight } from '@/components/icons';
import { useVisitorCurrency } from '@/lib/visitor-currency';

const SITE = 'https://urganize.app';
export const WAITLIST_URL = `${SITE}/#waitlist`;
export const ANDROID_URL = `${SITE}/download`;
export const TERMS_URL = `${SITE}/terms`;
export const PRIVACY_URL = `${SITE}/privacy`;

type Interval = 'monthly' | 'annual';

const naira = (amount: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);

/** Same figures as the /pricing card (apps/homepage PricingTierCards). */
function cardPrice(tierId: PricingTierId, interval: Interval, currency: PricingCurrencyCode = 'NGN') {
  if (getTier(tierId).contactSales) {
    // Label is a custom deal: no price shown, in Naira or dollars (#1120).
    const custom = formatTierFromPrice(tierId, interval);
    return { figure: custom ?? 'Let’s talk', unit: null, sub: 'A price set with you, for your roster.', was: null };
  }
  // Dollars outside Nigeria (#1120): one fixed price, no starting price.
  if (currency === 'USD') {
    const usd = getTierPriceIn(tierId, interval, 'USD');
    if (!usd) return { figure: '', unit: null, sub: null, was: null };
    return interval === 'monthly'
      ? { figure: formatMoney(usd.amount, 'USD'), unit: '/month', sub: null, was: null }
      : {
          figure: formatMoney(usd.amount, 'USD'),
          unit: '/year',
          sub: `${formatMoney(Math.round(usd.amount / 12), 'USD')} a month, paid once a year`,
          was: null,
        };
  }
  if (interval === 'monthly') {
    const intro = getIntroPrice(tierId);
    const full = getTierPrice(tierId, 'monthly');
    if (intro) {
      return { figure: naira(intro.amount), unit: '/month', sub: introThenLine(tierId), was: full ? `${naira(full.amount)}/month` : null };
    }
    return { figure: full ? naira(full.amount) : '', unit: '/month', sub: null, was: null };
  }
  const yearly = getTierPrice(tierId, 'annual');
  if (!yearly) return { figure: '', unit: null, sub: null, was: null };
  return { figure: naira(yearly.amount), unit: '/year', sub: `${naira(Math.round(yearly.amount / 12))} a month, paid once a year`, was: null };
}

function CheckLine({ children }: { children: string }) {
  return (
    <li className="flex gap-2.5 text-[13px] leading-5 text-content-secondary">
      <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export function AuthPlans() {
  const [interval, setInterval] = useState<Interval>('monthly');
  const currency = useVisitorCurrency();

  return (
    <section aria-labelledby="auth-plans" className="mt-[72px] flex flex-col items-center px-4 md:mt-[176px] md:px-[60px]">
      <h2 id="auth-plans" className="font-display text-[26px] font-normal leading-8 text-content-primary md:text-[30px] md:leading-[38px]">
        Explore plans
      </h2>
      <p className="mt-2 text-[15px] leading-[22px] text-content-secondary">Wherever you are in your career.</p>
      <div role="radiogroup" aria-label="Billing" className="mt-5 inline-flex gap-0.5 rounded-[10px] bg-bg-hover p-[3px] md:mt-6">
        {(['monthly', 'annual'] as const).map((option) => {
          const active = option === interval;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setInterval(option)}
              className={`h-[38px] rounded-lg border px-4 text-sm font-medium md:h-[30px] md:text-[13px] ${
                active
                  ? 'border-stroke-default bg-bg-surface text-content-primary shadow-sm'
                  : 'border-transparent text-content-secondary hover:text-content-primary'
              }`}
            >
              {option === 'monthly' ? 'Monthly' : 'Yearly'}
            </button>
          );
        })}
      </div>

      {/* Two groups since pricing v4 (2026-11-08): "Just you" and "Your team",
          three plans each, the same as urganize.app/pricing. */}
      {TIER_GROUP_ORDER.map((groupId) => (
      <div key={groupId} className="mt-7 flex w-full max-w-[1320px] flex-col md:mt-[45px]">
      <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-content-tertiary">{TIER_GROUP_LABEL[groupId]}</h3>
      <div className="grid w-full gap-4 md:grid-cols-2 md:gap-[30px] xl:grid-cols-3">
        {TIER_GROUPS[groupId].map((tierId) => {
          const tier = getTier(tierId);
          const { figure, unit, sub, was } = cardPrice(tierId, interval, currency);
          const { heading, outcomes, includes } = tierOutcomes(tierId, currency);
          return (
            <article
              key={tierId}
              className={`flex flex-col rounded-xl border bg-bg-surface p-5 md:p-[30px] ${
                tier.recommended ? 'border-brand/50 shadow-md' : 'border-stroke-default'
              }`}
            >
              <PlanPicture
                activeReleases={tier.limits.activeReleases}
                seats={tier.limits.seats}
                monthlyCredits={tier.urgansMonthlyCredits}
              />
              <h3 className="mt-[18px] font-display text-[26px] font-normal leading-8 text-content-primary md:mt-6 md:text-[28px] md:leading-[34px]">
                {tier.label}
              </h3>
              <p className="mt-1 text-[15px] leading-[21px] text-content-secondary md:text-sm md:leading-5">{tier.audience}</p>
              <p className="mt-4 min-h-4 text-[13px] leading-4 text-content-tertiary line-through md:mt-[18px] md:text-xs">{was ?? ''}</p>
              <p className="mt-0.5 flex items-baseline gap-1">
                <span className="text-2xl font-semibold leading-[30px] tracking-[-0.01em] text-content-primary">{figure}</span>
                {unit ? <span className="text-sm text-content-secondary md:text-[13px]">{unit}</span> : null}
              </p>
              <p className="mt-1 min-h-[17px] text-[13px] leading-[18px] text-content-secondary md:text-xs md:leading-[17px]">{sub ?? ''}</p>
              <a
                href="/auth?mode=signup"
                data-plan={tierId}
                className="mt-[18px] flex h-11 items-center justify-center rounded-lg bg-content-primary text-[15px] font-semibold text-bg-base transition-opacity hover:opacity-90 md:mt-5 md:h-[38px] md:text-[13px]"
              >
                Choose {tier.label}
              </a>
              <div className="mt-[18px] border-t border-stroke-default md:mt-[22px]" />
              {heading ? (
                <>
                  <p className="mt-[18px] text-[13px] font-semibold leading-4 text-content-primary md:mt-[22px] md:text-xs">{heading}</p>
                  <ul className="mt-3 flex flex-col gap-3 md:mt-3.5 md:gap-3.5">
                    {outcomes.map((line) => (
                      <CheckLine key={line}>{line}</CheckLine>
                    ))}
                  </ul>
                </>
              ) : null}
              <p className="mt-6 text-[13px] font-semibold leading-4 text-content-tertiary md:text-xs">Includes</p>
              <ul className="mt-3 flex flex-col gap-3 md:mt-3.5 md:gap-3.5">
                {includes.map((line) => (
                  <CheckLine key={line}>{line}</CheckLine>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
      </div>
      ))}
      <p className="mt-6 max-w-[42rem] text-center text-xs leading-[18px] text-content-tertiary md:mt-10">
        {currency === 'USD'
          ? 'Prices are in US dollars. One price covers your whole team, not each person.'
          : 'Prices are in Naira. One price covers your whole team, not each person. The first month offer is for teams paying for the first time.'}
      </p>
    </section>
  );
}

const monthlyFigure = (tierId: PricingTierId, currency: PricingCurrencyCode) => {
  const price = getTierPriceIn(tierId, 'monthly', currency);
  return price ? formatMoney(price.amount, currency) : '';
};

const questions = (currency: PricingCurrencyCode) => [
  {
    q: 'What is Urganize?',
    a: CANONICAL_DESCRIPTION,
  },
  {
    q: 'Who is it for?',
    a: 'Artists and managers starting out, managers taking their artists to the next level, and record labels organising and scaling. Use it solo or with a team.',
  },
  {
    q: 'How much does it cost?',
    // Read from the pricing package so a reprice can never leave this answer
    // disagreeing with the plan cards above it.
    a: `Solo is ${monthlyFigure('solo', currency)} a month. Solo Plus, the first plan with distribution, is ${monthlyFigure('solo_plus', currency)}. For a team, Pro is ${monthlyFigure('manager', currency)} and Pro Plus is ${monthlyFigure('pro', currency)}. Label is priced with you. One price covers your whole team.`,
  },
];

export function AuthQuestions() {
  const currency = useVisitorCurrency();
  return (
    <section aria-labelledby="auth-faq" className="mt-[72px] flex flex-col items-center px-4 md:mt-[125px]">
      <h2 id="auth-faq" className="font-display text-[26px] font-normal leading-8 text-content-primary md:text-[30px] md:leading-[38px]">
        Questions people ask
      </h2>
      <div className="mt-5 w-full max-w-[656px] md:mt-[26px]">
        {questions(currency).map(({ q, a }) => (
          <details key={q} className="group border-b border-stroke-default">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[15px] text-content-primary md:min-h-[38px] md:text-[13px] [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronRight className="h-3.5 w-3.5 text-content-secondary transition-transform group-open:rotate-90" aria-hidden="true" />
            </summary>
            <p className="mb-4 text-sm leading-[21px] text-content-secondary md:mb-3.5 md:text-[13px] md:leading-5">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

const FOOTER_COLUMNS = [
  {
    heading: 'Product',
    links: [
      { href: `${SITE}/features`, label: 'Features' },
      { href: `${SITE}/pricing`, label: 'Pricing' },
      { href: `${SITE}/for-managers`, label: 'For managers' },
      { href: `${SITE}/why-urganize`, label: 'Why Urganize' },
      { href: ANDROID_URL, label: 'Android app' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: `${SITE}/team`, label: 'Team' },
      { href: `${SITE}/guides`, label: 'Guides' },
      { href: `${SITE}/changelog`, label: 'Updates' },
      { href: `${SITE}/brand`, label: 'Brand' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { href: 'https://wa.me/2347067367057', label: 'Chat with us on WhatsApp' },
      { href: 'mailto:contact@urganize.app', label: 'Email us' },
      { href: '/auth/forgot-password', label: 'Forgot password' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: TERMS_URL, label: 'Terms' },
      { href: PRIVACY_URL, label: 'Privacy' },
      { href: `${SITE}/subprocessors`, label: 'Subprocessors' },
    ],
  },
] as const;

const SOCIALS = [
  { href: 'https://x.com/urganize', label: 'Urganize on X', Icon: SiX },
  { href: 'https://www.instagram.com/urganize', label: 'Urganize on Instagram', Icon: SiInstagram },
  { href: 'https://www.linkedin.com/company/urganize', label: 'Urganize on LinkedIn', Icon: FaLinkedin },
  { href: 'https://www.tiktok.com/@urganize', label: 'Urganize on TikTok', Icon: SiTiktok },
  { href: 'https://www.youtube.com/@urganize', label: 'Urganize on YouTube', Icon: SiYoutube },
] as const;

export function AuthFooter({ logo }: { logo: React.ReactNode }) {
  return (
    <footer className="mt-[88px] flex flex-col px-4 pb-8 md:mt-[227px] md:px-[60px] md:pb-11">
      {/* 452 / 227 / 227 / 227 / 227 at 1440 wide, as fractions so it never
          overflows a narrower window. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-[minmax(0,452fr)_repeat(4,minmax(0,227fr))] md:gap-0">
        <div className="col-span-2 md:col-span-1">{logo}</div>
        {FOOTER_COLUMNS.map(({ heading, links }) => (
          <nav key={heading} aria-label={heading}>
            <p className="mb-2 text-xs leading-4 text-content-tertiary md:mb-3 md:text-[11px] md:leading-[14px]">{heading}</p>
            <ul className="flex flex-col text-sm leading-9 md:gap-[11px] md:text-[13px] md:leading-4">
              {links.map(({ href, label }) => (
                <li key={label}>
                  <a href={href} className="text-content-primary hover:text-brand">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mt-10 flex flex-col gap-3 md:mt-[120px] md:gap-3.5">
        {/* Static page: the year is the build's until the next deploy, so the
            browser's own year may differ for a few days after New Year. */}
        <p suppressHydrationWarning className="text-xs leading-4 text-content-tertiary md:text-[11px] md:leading-[14px]">
          &copy; {new Date().getFullYear()} Urganization
        </p>
        <div className="-ml-2 flex gap-1 text-content-secondary md:-ml-2 md:gap-1.5">
          {SOCIALS.map(({ href, label, Icon }) => (
            <a
              key={href}
              href={href}
              aria-label={label}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-11 items-center justify-center hover:text-content-primary md:h-[30px] md:w-[30px]"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
