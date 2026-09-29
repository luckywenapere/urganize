import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PAYOUT_RESOLVE_LIMIT_PER_HOUR } from '@/lib/pitch-payments';
import { PAYOUT_ACCOUNTS_TABLE, RESOLVE_ATTEMPTS_TABLE, getNigerianBanks } from '@/lib/pitch-payments-server';
import type { CuratorPayoutAccount, PayoutAccountStatus } from '@/types/pitch-payments';

// Shared by the curator payout routes. The flag and the curator gate come from
// the curator route group's own _shared.ts, like every other route under
// /api/curator.

export const PAYOUT_ACCOUNT_COLUMNS =
  'id,bank_name,account_last4,resolved_account_name,status,paystack_subaccount_code,created_at,activated_at';

const STATUSES: PayoutAccountStatus[] = ['pending', 'needs_review', 'active', 'retired', 'disabled'];

/** A payout account as its curator sees it. The subaccount code stays here. */
export function toCuratorPayoutAccount(row: Record<string, unknown>): CuratorPayoutAccount {
  const status = STATUSES.includes(row.status as PayoutAccountStatus) ? (row.status as PayoutAccountStatus) : 'pending';
  return {
    id: String(row.id || ''),
    bankName: String(row.bank_name || ''),
    accountLast4: String(row.account_last4 || ''),
    resolvedAccountName: String(row.resolved_account_name || ''),
    status,
    createdAt: String(row.created_at || ''),
    activatedAt: row.activated_at ? String(row.activated_at) : null,
  };
}

/** The curator's current account: the one that is not retired or disabled. */
export async function loadCurrentPayoutAccount(
  admin: SupabaseClient,
  curatorUserId: string
): Promise<{ error: string } | { row: Record<string, unknown> | null }> {
  const { data, error } = await admin
    .from(PAYOUT_ACCOUNTS_TABLE)
    .select(PAYOUT_ACCOUNT_COLUMNS)
    .eq('curator_user_id', curatorUserId)
    .in('status', ['pending', 'needs_review', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  return { row: (data as Record<string, unknown> | null) ?? null };
}

/**
 * The resolve rate limit. A resolve returns a real person's name, so this is
 * what stops the endpoint being a way to look people up by account number.
 *
 * FAILS CLOSED, unlike almost every counter in this app: if the attempts cannot
 * be counted, the lookup is refused. Being wrong that way costs a curator a
 * retry a minute later; being wrong the other way turns the endpoint into the
 * lookup service the limit exists to prevent.
 */
export async function consumeResolveAttempt(
  admin: SupabaseClient,
  curatorUserId: string,
  now: Date = new Date()
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from(RESOLVE_ATTEMPTS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('curator_user_id', curatorUserId)
    .gte('created_at', since);

  if (error || count === null) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Could not check that right now. Try again in a minute.' }, { status: 503 }),
    };
  }
  if (count >= PAYOUT_RESOLVE_LIMIT_PER_HOUR) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Too many account checks in an hour. Try again later.' },
        { status: 429 }
      ),
    };
  }

  const { error: insertError } = await admin
    .from(RESOLVE_ATTEMPTS_TABLE)
    .insert({ curator_user_id: curatorUserId, created_at: now.toISOString() });
  if (insertError) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Could not check that right now. Try again in a minute.' }, { status: 503 }),
    };
  }

  // Keep the table small: nothing older than a day is ever read. AWAITED, and
  // that is not style: a PostgREST builder runs only when something calls its
  // `then`, so `void builder` sends no request at all. Best effort, so a failure
  // here is ignored rather than refusing a lookup that already passed the limit.
  await admin
    .from(RESOLVE_ATTEMPTS_TABLE)
    .delete()
    .eq('curator_user_id', curatorUserId)
    .lt('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

  return { ok: true };
}

/** A bank code is only accepted if it is on Paystack's own list. */
export async function findBank(
  admin: SupabaseClient,
  bankCode: string
): Promise<{ code: string; name: string } | null> {
  const banks = await getNigerianBanks(admin);
  return banks?.find((bank) => bank.code === bankCode) ?? null;
}
