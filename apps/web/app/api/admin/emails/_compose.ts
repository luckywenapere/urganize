import type { SupabaseClient } from '@supabase/supabase-js';
import { getNeonClient } from '../_shared';
import { parseAudience } from '@/lib/email/audience';
import { resolveAudience, type ResolvedAudience, type WaitlistLoader } from '@/lib/email/audience-server';
import { BULK_RESERVE, computeSendBudget } from '@/lib/email/outbox';
import { readSendBudget } from '@/lib/email/outbox-server';

// Shared by the admin email routes (/api/admin/emails/*). Kept beside them
// rather than in lib/ because it reaches the marketing site's database through
// app/api/admin/_shared.ts, and lib must not import from app.

/** The marketing-site waitlist (the Neon "User" table), or undefined when
 *  DATABASE_URL is not set on this deployment. */
export function buildWaitlistLoader(): WaitlistLoader | undefined {
  const sql = getNeonClient();
  if (!sql) return undefined;
  return async () => {
    const rows = (await sql`SELECT email, name FROM "User" ORDER BY "createdAt" ASC`) as Array<{
      email: string | null;
      name: string | null;
    }>;
    return rows
      .filter((row): row is { email: string; name: string | null } => typeof row.email === 'string')
      .map((row) => ({ email: row.email, name: row.name || '' }));
  };
}

export async function resolveAudienceFromBody(
  admin: SupabaseClient,
  rawAudience: unknown
): Promise<{ parsed: ReturnType<typeof parseAudience>; resolved: ResolvedAudience | null }> {
  const parsed = parseAudience(rawAudience);
  if (!parsed.ok) return { parsed, resolved: null };
  const resolved = await resolveAudience(admin, parsed.audience, { loadWaitlist: buildWaitlistLoader() });
  return { parsed, resolved };
}

/** The day's email limit as the admin page shows it: how many have gone out
 *  today, and how many a broadcast may still use. */
export async function budgetPayload(admin: SupabaseClient) {
  const { dailyLimit, sentToday } = await readSendBudget(admin);
  return {
    dailyLimit,
    sentToday,
    bulkLeft: sentToday === null ? null : computeSendBudget({ dailyLimit, sentToday, reserve: BULK_RESERVE }),
    reserve: BULK_RESERVE,
  };
}
