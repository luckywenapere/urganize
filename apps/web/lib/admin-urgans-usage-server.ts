import type { SupabaseClient } from '@supabase/supabase-js';
import { readAll, str, type AdminReadSource, type Row } from './admin-read-server';
import { CREDIT_WEEKS, type AiUsageRow, type CreditLedgerRow } from './admin-urgans-usage';

// The two reads behind the cockpit's UrgAns panel (2026-10-09). Every rule about
// what a number means lives in ./admin-urgans-usage.ts; this file only fetches
// rows and shapes them. Service-role only: the one caller is the cockpit route,
// which has already passed verifyAdmin. Read-only.
//
// Each read is optional. A table that is missing or fails comes back as null
// rows plus its source, so the panel shows "Not tracked", never a zero.

const DAY_MS = 24 * 60 * 60 * 1000;
const TABLE_CAP = 50_000;

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toAiUsageRows(rows: Row[]): AiUsageRow[] {
  const out: AiUsageRow[] = [];
  for (const row of rows) {
    const createdAt = str(row.created_at);
    const feature = str(row.feature);
    if (!createdAt || !feature) continue;
    out.push({
      workspaceId: str(row.workspace_id),
      ownerUserId: str(row.owner_user_id),
      releaseId: str(row.release_id),
      feature,
      createdAt,
      costRodi: num(row.cost_rodi),
    });
  }
  return out;
}

export function toCreditLedgerRows(rows: Row[]): CreditLedgerRow[] {
  const out: CreditLedgerRow[] = [];
  for (const row of rows) {
    const createdAt = str(row.created_at);
    const kind = str(row.kind);
    const credits = num(row.credits);
    if (!createdAt || !kind || credits === null) continue;
    out.push({
      workspaceId: str(row.workspace_id),
      ownerUserId: str(row.owner_user_id),
      kind,
      credits,
      createdAt,
      providerCostRodi: num(row.provider_cost_rodi),
    });
  }
  return out;
}

export async function loadUrgansUsageRows(
  client: SupabaseClient,
  now: Date
): Promise<{ usage: AiUsageRow[] | null; ledger: CreditLedgerRow[] | null; sources: AdminReadSource[] }> {
  const sinceIso = new Date(now.getTime() - CREDIT_WEEKS * 7 * DAY_MS).toISOString();
  const [usage, ledger] = await Promise.all([
    readAll(
      'ai_usage_events',
      (from, to) =>
        client
          .from('ai_usage_events')
          .select('workspace_id, owner_user_id, release_id, feature, created_at, cost_rodi')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .range(from, to),
      TABLE_CAP
    ),
    readAll(
      'credit_ledger (spend and refunds)',
      (from, to) =>
        client
          .from('credit_ledger')
          .select('workspace_id, owner_user_id, kind, credits, created_at, provider_cost_rodi')
          .in('kind', ['spend', 'refund'])
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .range(from, to),
      TABLE_CAP
    ),
  ]);
  return {
    usage: usage.source.status === 'ok' ? toAiUsageRows(usage.rows) : null,
    ledger: ledger.source.status === 'ok' ? toCreditLedgerRows(ledger.rows) : null,
    sources: [usage.source, ledger.source],
  };
}
