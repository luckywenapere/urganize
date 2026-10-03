import type { SupabaseClient } from '@supabase/supabase-js';

import type { UsageCall } from '@/lib/credits/pricing';

import { buildUsageRows, type FailedCall, type UsageEventRow, type UsageLogContext } from './usage-log';

/**
 * The write half of the AI usage log. The ONLY file that touches
 * `ai_usage_events`; lib/ai/usage-log-guard.test.ts holds it to that.
 *
 * It NEVER THROWS and never blocks. The log exists to measure what AI costs, and
 * a measurement that can break the turn it measures would be worse than none: a
 * missing table, a rejected row or a database that is down costs a log line and
 * nothing else. That is also why it is safe to ship before the migration is
 * applied: until then every write answers "no such table", is reported once, and
 * the product behaves exactly as it did.
 *
 * Rows are keyed on (request id, call index) and inserted with
 * ignore-duplicates, so recording the same request twice records it once.
 */

const TABLE = 'ai_usage_events';

// Postgres: undefined_table. PostgREST: the table is not in its schema cache.
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

let warnedMissing = false;

function report(error: unknown): void {
  const code = (error as { code?: string } | null)?.code;
  if (typeof code === 'string' && MISSING_TABLE_CODES.has(code)) {
    if (warnedMissing) return;
    warnedMissing = true;
    console.warn('[ai-usage] ai_usage_events does not exist yet, so AI usage is not being recorded. Apply 20261003120000_ai_usage_events.sql.');
    return;
  }
  const message = (error as { message?: string } | null)?.message ?? String(error);
  console.error('[ai-usage] could not record usage:', message);
}

/** Write rows. Never throws. */
export async function recordAiUsage(client: SupabaseClient, rows: readonly UsageEventRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const { error } = await client
      .from(TABLE)
      .upsert(rows as UsageEventRow[], { onConflict: 'request_id,call_index', ignoreDuplicates: true });
    if (error) report(error);
  } catch (error) {
    report(error);
  }
}

/** Build and write one request's rows. Never throws. */
export async function recordRequestUsage(
  client: SupabaseClient,
  input: {
    context: UsageLogContext;
    calls: readonly UsageCall[];
    failures: readonly FailedCall[];
    creditsCharged: number;
  }
): Promise<void> {
  try {
    await recordAiUsage(client, buildUsageRows(input));
  } catch (error) {
    report(error);
  }
}

/** For tests: forget that the missing-table warning was already given. */
export function resetUsageLogWarnings(): void {
  warnedMissing = false;
}
