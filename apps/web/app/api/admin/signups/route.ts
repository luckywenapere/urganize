import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';

// Monthly product-signup counts, from Supabase profiles.created_at — real
// Urganize accounts, not the marketing site's Neon waitlist (that's Growth
// and Waitlist, both ported from apps/homepage and answering a different
// question). Counts every profiles row regardless of role, so a
// curator-only account counts as a signup here the same as a team account.
//
// Bucketed in JS rather than SQL: unlike Growth (Neon's `sql` tag can run
// raw date_trunc/generate_series), this goes through PostgREST via the
// Supabase client, which has no equivalent without a new RPC
// function/migration. So the monthly breakdown fetches created_at for every
// row (capped, see PROFILE_FETCH_LIMIT) and groups by calendar month in JS,
// filling any month with zero signups so the chart has no gaps.
//
// This is NEW signups per month (a count of signup events), not a
// cumulative running total — different in kind from Growth's cumulative
// per-week shape. Don't "fix" it to match Growth; they're answering
// different questions.

const MONTHS_WINDOW = 12;
const PROFILE_FETCH_LIMIT = 10000;

const MONTH_ABBREVIATIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function monthKeyFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(key: string): string {
  const [yearPart, monthPart] = key.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  return `${MONTH_ABBREVIATIONS[monthIndex] ?? monthPart} ${year}`;
}

// Trailing `count` calendar months, oldest first, ending with the current
// (partial) month. UTC throughout so a signup near midnight lands in a
// consistent bucket regardless of the server's local timezone.
function buildTrailingMonthKeys(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const bucketDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    keys.push(monthKeyFromDate(bucketDate));
  }
  return keys;
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;

  try {
    const [countResult, timestampsResult] = await Promise.all([
      client.from('profiles').select('id', { count: 'exact', head: true }),
      client
        .from('profiles')
        .select('created_at')
        .order('created_at', { ascending: true })
        .range(0, PROFILE_FETCH_LIMIT - 1),
    ]);

    if (countResult.error) {
      return NextResponse.json(
        { error: `Could not read signups: ${countResult.error.message}` },
        { status: 500 }
      );
    }
    if (timestampsResult.error) {
      return NextResponse.json(
        { error: `Could not read signups: ${timestampsResult.error.message}` },
        { status: 500 }
      );
    }

    const rows = (timestampsResult.data || []) as Array<{ created_at: string | null }>;

    const countsByMonth = new Map<string, number>();
    for (const row of rows) {
      if (!row.created_at) continue;
      const parsed = new Date(row.created_at);
      if (Number.isNaN(parsed.getTime())) continue;
      const key = monthKeyFromDate(parsed);
      countsByMonth.set(key, (countsByMonth.get(key) ?? 0) + 1);
    }

    const monthKeys = buildTrailingMonthKeys(new Date(), MONTHS_WINDOW);
    const months = monthKeys.map((key) => ({
      monthKey: key,
      monthLabel: monthLabelFromKey(key),
      newSignups: countsByMonth.get(key) ?? 0,
    }));

    const last12MonthsSignups = months.reduce((sum, month) => sum + month.newSignups, 0);

    return NextResponse.json({
      totalSignups: countResult.count ?? rows.length,
      last12MonthsSignups,
      months,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load signups.' },
      { status: 500 }
    );
  }
}
