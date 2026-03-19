export type IndividualPlanId = 'monthly' | '8months' | 'yearly';
export type GroupBillingCycle = 'monthly' | 'yearly';
export type GroupPaymentMode = 'full' | 'split';
export type BillingPlanId = IndividualPlanId | 'group_monthly' | 'group_yearly';

export const MIN_GROUP_TEAM_SIZE = 5;
export const MAX_GROUP_TEAM_SIZE = 50;

export const INDIVIDUAL_PLAN_OPTIONS: Array<{
  id: IndividualPlanId;
  label: string;
  amount: number;
  description: string;
}> = [
  { id: 'monthly', label: 'Monthly', amount: 8000, description: 'Pay monthly at NGN 8,000.' },
  { id: '8months', label: '8 Months', amount: 57600, description: 'Save 10% compared to monthly billing.' },
  { id: 'yearly', label: 'Yearly', amount: 80000, description: 'Best for committed teams and long campaigns.' },
];

export const GROUP_PRICING = {
  baseSeats: 5,
  monthlyBaseAmount: 32000,
  yearlyBaseAmount: 320000,
  monthlyExtraSeatAmount: 6400,
  yearlyExtraSeatAmount: 64000,
};

type SafeMetadata = Record<string, string | number | boolean | null | undefined>;
export type PaystackMetadata = Record<string, string | number | boolean>;

export type GroupPlanPricing = {
  billingCycle: GroupBillingCycle;
  paymentMode: GroupPaymentMode;
  teamSize: number;
  extraSeats: number;
  totalAmount: number;
  perSeatAmount: number;
  seatsPaidNow: number;
  amountDueNow: number;
};

const toSafeInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
};

export const clampTeamSize = (value: unknown): number => {
  const parsed = toSafeInteger(value, MIN_GROUP_TEAM_SIZE);
  if (parsed < MIN_GROUP_TEAM_SIZE) return MIN_GROUP_TEAM_SIZE;
  if (parsed > MAX_GROUP_TEAM_SIZE) return MAX_GROUP_TEAM_SIZE;
  return parsed;
};

const clampSeatsPaidNow = (value: unknown, teamSize: number): number => {
  const parsed = toSafeInteger(value, 1);
  if (parsed < 1) return 1;
  if (parsed > teamSize) return teamSize;
  return parsed;
};

export const calculateGroupPlanPricing = ({
  billingCycle,
  paymentMode = 'full',
  teamSize,
  seatsPaidNow,
}: {
  billingCycle: GroupBillingCycle;
  paymentMode?: GroupPaymentMode;
  teamSize: number;
  seatsPaidNow?: number;
}): GroupPlanPricing => {
  const safeTeamSize = clampTeamSize(teamSize);
  const extraSeats = Math.max(0, safeTeamSize - GROUP_PRICING.baseSeats);
  const totalAmount =
    billingCycle === 'yearly'
      ? GROUP_PRICING.yearlyBaseAmount + extraSeats * GROUP_PRICING.yearlyExtraSeatAmount
      : GROUP_PRICING.monthlyBaseAmount + extraSeats * GROUP_PRICING.monthlyExtraSeatAmount;

  const perSeatAmount = Math.max(1, Math.round(totalAmount / safeTeamSize));
  const safeSeatsPaidNow = paymentMode === 'split' ? clampSeatsPaidNow(seatsPaidNow, safeTeamSize) : safeTeamSize;
  const amountDueNow = paymentMode === 'split' ? perSeatAmount * safeSeatsPaidNow : totalAmount;

  return {
    billingCycle,
    paymentMode,
    teamSize: safeTeamSize,
    extraSeats,
    totalAmount,
    perSeatAmount,
    seatsPaidNow: safeSeatsPaidNow,
    amountDueNow,
  };
};

export const getIndividualPlanAmount = (planId: IndividualPlanId): number => {
  return INDIVIDUAL_PLAN_OPTIONS.find((plan) => plan.id === planId)?.amount || INDIVIDUAL_PLAN_OPTIONS[0].amount;
};

export const getBillingCycleFromPlan = (plan: string): GroupBillingCycle | null => {
  if (plan === 'group_monthly') return 'monthly';
  if (plan === 'group_yearly') return 'yearly';
  return null;
};

export const isIndividualPlan = (plan: string): plan is IndividualPlanId => {
  return plan === 'monthly' || plan === '8months' || plan === 'yearly';
};

export const resolveExpectedAmount = (plan: string, metadata: SafeMetadata = {}): number | null => {
  if (isIndividualPlan(plan)) return getIndividualPlanAmount(plan);

  const groupCycle = getBillingCycleFromPlan(plan);
  if (!groupCycle) return null;

  const paymentMode = metadata.payment_mode === 'split' ? 'split' : 'full';
  const rawTeamSize = Number(metadata.team_size);
  const rawSeatsPaidNow = Number(metadata.seats_paid_now);
  const pricing = calculateGroupPlanPricing({
    billingCycle: groupCycle,
    paymentMode,
    teamSize: Number.isFinite(rawTeamSize) ? rawTeamSize : MIN_GROUP_TEAM_SIZE,
    seatsPaidNow: Number.isFinite(rawSeatsPaidNow) ? rawSeatsPaidNow : undefined,
  });
  return pricing.amountDueNow;
};

export const getPlanExpiry = (plan: string, now = new Date()): Date => {
  const expiresAt = new Date(now);

  if (plan === 'yearly' || plan === 'group_yearly') {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    return expiresAt;
  }

  if (plan === '8months') {
    expiresAt.setMonth(expiresAt.getMonth() + 8);
    return expiresAt;
  }

  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return expiresAt;
};

export const buildGroupPaymentMetadata = ({
  billingCycle,
  paymentMode,
  teamSize,
  seatsPaidNow,
}: {
  billingCycle: GroupBillingCycle;
  paymentMode: GroupPaymentMode;
  teamSize: number;
  seatsPaidNow: number;
}): PaystackMetadata => {
  const pricing = calculateGroupPlanPricing({
    billingCycle,
    paymentMode,
    teamSize,
    seatsPaidNow,
  });

  return {
    payment_mode: pricing.paymentMode,
    billing_cycle: pricing.billingCycle,
    team_size: pricing.teamSize,
    seats_paid_now: pricing.seatsPaidNow,
    total_team_amount: pricing.totalAmount,
    per_seat_amount: pricing.perSeatAmount,
  };
};
