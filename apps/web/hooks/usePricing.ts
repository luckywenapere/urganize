'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import {
  convertAmount,
  formatAnnualEquivalentLabel,
  formatCurrencyAmount,
  formatPlanCyclePrice,
  getPlanPriceAmount,
  getPricingSymbol,
  resolveClientTimezone,
  resolvePricingCurrency,
  type PricingContext,
  type PricingCurrencyCode,
} from '@/lib/pricing';

type UsePricingOptions = PricingContext;

type UserPricingFields = {
  country?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

export function usePricing(options: UsePricingOptions = {}) {
  const user = useAuthStore((state) => state.user) as (UserPricingFields & { id?: string | null }) | null;
  const clientTimezone = useMemo(() => resolveClientTimezone(), []);

  const currencyCode = useMemo<PricingCurrencyCode>(() => {
    return resolvePricingCurrency({
      country: options.country ?? user?.country ?? null,
      locale: options.locale ?? user?.locale ?? null,
      timezone: options.timezone ?? user?.timezone ?? clientTimezone,
    });
  }, [clientTimezone, options.country, options.locale, options.timezone, user?.country, user?.locale, user?.timezone]);

  const symbol = getPricingSymbol(currencyCode);

  return {
    currencyCode,
    symbol,
    monthly: formatPlanCyclePrice('monthly', currencyCode),
    annual: formatPlanCyclePrice('annual', currencyCode),
    monthlyAmount: getPlanPriceAmount('monthly', currencyCode),
    annualAmount: getPlanPriceAmount('annual', currencyCode),
    annualEquivalent: formatAnnualEquivalentLabel(currencyCode),
    isNigerianUser: currencyCode === 'NGN',
    formatAmount: (amount: number, sourceCurrency: PricingCurrencyCode = currencyCode) =>
      formatCurrencyAmount(
        sourceCurrency === currencyCode ? amount : convertAmount(amount, sourceCurrency, currencyCode),
        currencyCode
      ),
  };
}
