import {
  normalizePricingValidationResponse,
  type StoredPricingValidationResponse,
} from '@/lib/pricing-validation';

// Canonical auth helpers live in app/api/_shared/auth.ts; re-exported here
// so the pricing-validation route import sites stay stable. This is an open
// route group (must work for locked users), so only getAuthenticatedUser is
// re-exported — not the 402 gate.
export { getAuthenticatedUser, createAdminClient } from '@/app/api/_shared/auth';

export const PRICING_VALIDATION_TABLE = 'pricing_validation_responses';

export const PRICING_VALIDATION_SQL = [
  'create extension if not exists pgcrypto;',
  '',
  'create table if not exists public.pricing_validation_responses (',
  '  id uuid primary key default gen_random_uuid(),',
  '  user_id uuid not null unique references auth.users(id) on delete cascade,',
  "  willingness text null check (willingness in ('yes', 'maybe', 'no')),",
  "  price_band text null check (price_band in ('under-5000', '5000-10000', '10000-plus', 'not-sure')),",
  '  notes text not null default \'\',',
  "  placement text not null default 'dashboard' check (placement in ('onboarding', 'dashboard', 'research')),",
  '  created_at timestamptz not null default now(),',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  'create index if not exists pricing_validation_responses_user_id_idx on public.pricing_validation_responses(user_id);',
  '',
  'alter table public.pricing_validation_responses enable row level security;',
].join('\n');

export const isOptionalTableMissingError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
};

type PricingValidationRow = {
  id: string;
  user_id: string;
  willingness: string | null;
  price_band: string | null;
  notes: string | null;
  placement: string | null;
  created_at: string;
  updated_at: string;
};

export const toClientPricingValidation = (row: PricingValidationRow): StoredPricingValidationResponse => {
  const normalized = normalizePricingValidationResponse({
    willingness: row.willingness,
    priceBand: row.price_band,
    notes: row.notes,
    placement: row.placement,
  });

  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...normalized,
  };
};
