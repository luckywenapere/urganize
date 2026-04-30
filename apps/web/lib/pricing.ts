export const PRICING = {
  monthly: { usd: 9.99, ngn: 10000 },
  annual: { usd: 59.99, ngn: 89999 },
} as const;

export const PRICING_EXCHANGE_RATE_NGN_PER_USD = 1500;
export const TRIAL_AUTHORIZATION_AMOUNT = {
  usd: 1,
  ngn: 100,
} as const;
export const NIGERIA_TIMEZONE = 'Africa/Lagos';

export type PricingPlanId = keyof typeof PRICING;
export type PricingCurrencyCode = 'USD' | 'NGN';
export type PricingContext = {
  country?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

const normalizeValue = (value: string | null | undefined): string => String(value || '').trim().toLowerCase();

const isNigerianCountry = (value: string | null | undefined): boolean => {
  const normalized = normalizeValue(value);
  return normalized === 'ng' || normalized === 'nga' || normalized.includes('nigeria');
};

const isNigerianLocale = (value: string | null | undefined): boolean => {
  const normalized = normalizeValue(value).replace('_', '-');
  return normalized.endsWith('-ng') || normalized === 'en-ng';
};

export const isNigerianPricingContext = (context: PricingContext = {}): boolean => {
  if (isNigerianCountry(context.country)) return true;
  if (isNigerianLocale(context.locale)) return true;
  return normalizeValue(context.timezone) === NIGERIA_TIMEZONE.toLowerCase();
};

export const normalizePricingCurrency = (
  value: string | null | undefined
): PricingCurrencyCode => (normalizeValue(value) === 'ngn' ? 'NGN' : 'USD');

export const resolvePricingCurrency = (
  context: PricingContext = {}
): PricingCurrencyCode => (isNigerianPricingContext(context) ? 'NGN' : 'USD');

export const getPricingSymbol = (currency: PricingCurrencyCode): '$' | '₦' =>
  currency === 'NGN' ? '₦' : '$';

export const getPlanPriceAmount = (
  plan: PricingPlanId,
  currency: PricingCurrencyCode
): number => (currency === 'NGN' ? PRICING[plan].ngn : PRICING[plan].usd);

export const convertAmount = (
  amount: number,
  from: PricingCurrencyCode,
  to: PricingCurrencyCode
): number => {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;
  if (from === 'USD') {
    return Math.round(amount * PRICING_EXCHANGE_RATE_NGN_PER_USD);
  }

  return Number((amount / PRICING_EXCHANGE_RATE_NGN_PER_USD).toFixed(2));
};

export const formatCurrencyAmount = (
  amount: number,
  currency: PricingCurrencyCode
): string => {
  if (currency === 'NGN') {
    return `₦${Math.round(amount).toLocaleString('en-US')}`;
  }

  return `$${amount.toFixed(2)}`;
};

export const formatPlanPrice = (
  plan: PricingPlanId,
  currency: PricingCurrencyCode
): string => formatCurrencyAmount(getPlanPriceAmount(plan, currency), currency);

export const formatPlanCyclePrice = (
  plan: PricingPlanId,
  currency: PricingCurrencyCode
): string => `${formatPlanPrice(plan, currency)}/${plan === 'monthly' ? 'month' : 'year'}`;

export const formatAnnualEquivalentLabel = (
  currency: PricingCurrencyCode
): string => {
  if (currency === 'NGN') {
    return `~${formatCurrencyAmount(Math.round(PRICING.annual.ngn / 12), 'NGN')}/month, billed annually`;
  }

  return '~$5/month, billed annually';
};

export const getTrialAuthorizationAmount = (
  currency: PricingCurrencyCode
): number => (currency === 'NGN' ? TRIAL_AUTHORIZATION_AMOUNT.ngn : TRIAL_AUTHORIZATION_AMOUNT.usd);

export const resolveClientTimezone = (): string | null => {
  if (typeof window === 'undefined') return null;

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};
