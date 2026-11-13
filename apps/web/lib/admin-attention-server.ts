import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminAttention } from '@/lib/admin-overview';
import { ISSUE_REPORTS_TABLE } from '@/lib/issue-reports-server';
import { PAYMENTS_TABLE, PAYOUT_ACCOUNTS_TABLE, QUOTES_TABLE } from '@/lib/pitch-payments-server';
import { CURATOR_APPLICATIONS_TABLE } from '@/lib/curator-applications-server';

// What is waiting on a person in the admin: open reports, pitch payments that
// need a look, and playlist owners' applications. Read by the Overview
// (GET /api/admin/overview) and by the admin menu's red counts
// (GET /api/admin/attention), so the two never disagree. Moved here unchanged
// from the overview route on 2026-11-12 (#1241). Head-only counts: no rows.

async function countRows(
  query: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number | null> {
  try {
    const { count, error } = await query;
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

export async function readAdminAttention(client: SupabaseClient): Promise<AdminAttention> {
  const head = { count: 'exact' as const, head: true };
  const [reports, payouts, quotes, refunds, curatorApplications] = await Promise.all([
    countRows(client.from(ISSUE_REPORTS_TABLE).select('id', head).in('status', ['pending', 'failed'])),
    countRows(client.from(PAYOUT_ACCOUNTS_TABLE).select('id', head).eq('status', 'needs_review')),
    countRows(client.from(QUOTES_TABLE).select('id', head).eq('status', 'needs_review')),
    countRows(client.from(PAYMENTS_TABLE).select('id', head).in('status', ['refund_pending', 'refund_failed'])),
    countRows(client.from(CURATOR_APPLICATIONS_TABLE).select('id', head).eq('status', 'new')),
  ]);
  const parts = [payouts, quotes, refunds];
  return {
    reports,
    pitchPayments: parts.every((part) => part === null)
      ? null
      : parts.reduce<number>((sum, part) => sum + (part ?? 0), 0),
    curatorApplications,
  };
}
