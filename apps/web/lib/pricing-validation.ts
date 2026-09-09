export type PricingWillingness = 'yes' | 'maybe' | 'no';
export type PricingBand = 'under-5000' | '5000-10000' | '10000-plus' | 'not-sure';
export type PricingPromptPlacement = 'onboarding' | 'dashboard' | 'research';

export type PricingValidationResponse = {
  willingness: PricingWillingness | null;
  priceBand: PricingBand | null;
  notes: string;
  placement: PricingPromptPlacement;
};

export type StoredPricingValidationResponse = PricingValidationResponse & {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_PRICING_VALIDATION_RESPONSE: PricingValidationResponse = {
  willingness: null,
  priceBand: null,
  notes: '',
  placement: 'dashboard',
};

export const PRICING_WILLINGNESS_OPTIONS: Array<{
  value: PricingWillingness;
  label: string;
  description: string;
}> = [
  { value: 'yes', label: 'Yes, monthly', description: 'Strong willingness to pay if the value is clear.' },
  { value: 'maybe', label: 'Maybe', description: 'Interested, but pricing and proof will matter.' },
  { value: 'no', label: 'Not right now', description: 'The value or timing is not strong enough yet.' },
];

export const PRICING_BAND_OPTIONS: Array<{
  value: PricingBand;
  label: string;
}> = [
  { value: 'under-5000', label: 'Under NGN 5,000' },
  { value: '5000-10000', label: 'NGN 5,000 - 10,000' },
  { value: '10000-plus', label: 'Above NGN 10,000' },
  { value: 'not-sure', label: 'Not sure yet' },
];

export const PRICING_VALIDATION_COPY = {
  primaryPrompt:
    'If Urganize could solve mastering for you and also give you rollout planning, listener insight, marketing guidance, consultations, investor-readiness support, and one organized place, would you pay for it monthly?',
  supportingPoints: [
    'Become more investor-ready with clearer rollout execution and presentation.',
    'Access free consultations when you need strategic direction.',
    'Identify your unique listener profile and market to the right people.',
    'Get practical digital and organic marketing guidance.',
    'Follow clear step-by-step rollout planning without scattered tools.',
    'Keep everything organized in one stress-free place.',
  ],
  variations: {
    onboarding: [
      'Urganize just mapped your rollout work. If it also handled mastering and kept planning, audience insight, marketing support, consultations, and execution in one place, would you pay monthly for it?',
      'You now have your first rollout plan. If Urganize could also solve mastering and keep your rollout strategy, listener targeting, consultations, and execution stress-free in one place, would a monthly subscription feel worth it?',
      'If this platform could give you mastering plus the full rollout system you need, from planning and listener profiling to marketing guidance and consultations, would you pay for it every month?',
    ],
    dashboard: [
      'Would you pay monthly for Urganize if it solved mastering and kept rollout planning, listener insight, marketing support, consultations, and execution organized in one place?',
      'If Urganize could keep you stress-free by handling mastering alongside planning, audience profiling, marketing guidance, and consultations, would you subscribe monthly?',
      'How likely are you to pay monthly for a platform that combines mastering, rollout planning, listener targeting, consultation access, and organization in one place?',
    ],
    research: [
      'If Urganize solved mastering and gave you the major tools you need to plan rollouts, understand your audience, improve marketing, access consultations, and stay organized, would you pay monthly for it?',
      'We are testing whether artists and teams would pay monthly for an all-in-one rollout platform that includes mastering, investor-readiness support, listener profiling, marketing guidance, and consultations. Would you?',
      'Would a monthly subscription make sense to you if Urganize could combine mastering, rollout execution, audience insight, consultations, and stress-free organization in one product?',
    ],
  },
} as const;

export const normalizePricingValidationResponse = (
  value: Record<string, unknown> | null | undefined
): PricingValidationResponse => {
  const willingness = String(value?.willingness || '').trim();
  const priceBand = String(value?.priceBand || '').trim();
  const placement = String(value?.placement || '').trim();
  return {
    willingness:
      willingness === 'yes' || willingness === 'maybe' || willingness === 'no'
        ? (willingness as PricingWillingness)
        : null,
    priceBand:
      priceBand === 'under-5000' ||
      priceBand === '5000-10000' ||
      priceBand === '10000-plus' ||
      priceBand === 'not-sure'
        ? (priceBand as PricingBand)
        : null,
    notes: String(value?.notes || '').trim(),
    placement:
      placement === 'onboarding' || placement === 'dashboard' || placement === 'research'
        ? (placement as PricingPromptPlacement)
        : 'dashboard',
  };
};
