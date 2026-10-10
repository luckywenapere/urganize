import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { internalAccountEmails, verifyAdmin } from '../_shared';
import { summarizeDirectory, summarizeWorkRequests } from '@/lib/directory-admin-summary';
import { DIRECTORY_DEMAND_SOURCES, type DirectoryDemandSource } from '@/lib/directory-demand';
import { scoreboardReadCache } from '@/lib/scoreboard-cache-server';
import { internalUserIds, withoutInternalAccounts } from '@/lib/admin-internal-accounts';
import { loadDirectoryGrowth } from '@/lib/directory-growth-server';
import type { DirectoryGrowth } from '@/lib/directory-growth';
import type { AdminReadSource } from '@/lib/admin-read-server';

/**
 * GET /api/admin/directory — supply against demand, one row per role.
 *
 * The one table that answers a cold-start marketplace's only question: which
 * roles are managers asking for that nobody has delivered. That is `recruit`,
 * and it is the reason the demand signal is a durable row rather than an
 * analytics event alone (lib/directory-demand.ts).
 *
 * It also reports how the requests are doing (sent, answered, closed with no
 * answer, and the reply rate), read from work_requests. That is the number the
 * demand test in the Profiles and Directory spec asks for: do messages get a
 * reply. Counted over the same 90 days as demand.
 *
 * NOT flag-gated, the /admin/teams and /admin/urgans precedent: with
 * NEXT_PUBLIC_FEATURE_DIRECTORY off every table simply reads empty, and the
 * founder should be able to watch it fill from the day it is switched on.
 */

export const maxDuration = 60;

const LOOKBACK_DAYS = 90;
const QUERY_LIMIT = 5000;

type DemandQueryRow = { metadata: Record<string, unknown> | null };

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [profilesResult, recordsResult, demandResult, requestsResult] = await Promise.all([
    client.from('person_profiles').select('roles').neq('visibility', 'private').limit(QUERY_LIMIT),
    client.from('delivery_records').select('user_id, role').limit(QUERY_LIMIT),
    client
      .from('billing_events')
      .select('metadata')
      .eq('type', 'directory_role_wanted')
      .gte('created_at', since)
      .limit(QUERY_LIMIT),
    client
      .from('work_requests')
      .select('status, created_at')
      .gte('created_at', since)
      .limit(QUERY_LIMIT),
  ]);

  // Reported separately rather than collapsed into one message: a directory
  // with no migration applied answers three different errors, and knowing
  // which table is missing is the difference between a two minute fix and a
  // hunt.
  for (const [table, result] of [
    ['person_profiles', profilesResult],
    ['delivery_records', recordsResult],
    ['billing_events', demandResult],
    ['work_requests', requestsResult],
  ] as const) {
    if (result.error) {
      return NextResponse.json(
        { error: `Could not read ${table}: ${result.error.message}` },
        { status: 500 }
      );
    }
  }

  const profiles = ((profilesResult.data || []) as { roles: string[] | null }[]).map((row) => ({
    roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
  }));

  const records = ((recordsResult.data || []) as { user_id: string; role: string }[]).map((row) => ({
    userId: String(row.user_id || ''),
    role: String(row.role || ''),
  }));

  const demand = ((demandResult.data || []) as DemandQueryRow[])
    .map((row) => row.metadata || {})
    .filter(
      (meta): meta is { role: string; matched: boolean; source: DirectoryDemandSource } =>
        typeof meta.role === 'string' &&
        typeof meta.matched === 'boolean' &&
        typeof meta.source === 'string' &&
        (DIRECTORY_DEMAND_SOURCES as readonly string[]).includes(meta.source)
    )
    .map((meta) => ({ role: meta.role, matched: meta.matched, source: meta.source }));

  const requests = ((requestsResult.data || []) as { status: string; created_at: string }[]).map((row) => ({
    status: String(row.status || ''),
    createdAt: String(row.created_at || ''),
  }));

  // The weekly numbers (2026-10-10): seeded, invited, claimed, rollouts started
  // and live, requests and the reply rate. Read through the Scoreboard's shared
  // cache for the rollouts' live dates, with our own accounts left out like the
  // cockpit does (`?team=1` brings them back). A failure here never takes the
  // rest of the page down: the page shows the growth section as "Not tracked".
  let growth: DirectoryGrowth | null = null;
  let growthSources: AdminReadSource[] = [];
  const includeTeam = request.nextUrl.searchParams.get('team') === '1';
  try {
    const { input: fullInput, extras } = await scoreboardReadCache.get(client, {
      fresh: request.nextUrl.searchParams.get('fresh') === '1',
    });
    const exclusion = withoutInternalAccounts(
      fullInput,
      internalUserIds(extras.emailByUserId, includeTeam ? new Set<string>() : internalAccountEmails())
    );
    const loaded = await loadDirectoryGrowth(client, exclusion.input, exclusion);
    growth = loaded.growth;
    growthSources = loaded.sources;
  } catch (error) {
    console.error('[admin-directory] could not build the weekly numbers', error);
  }

  return NextResponse.json({
    lookbackDays: LOOKBACK_DAYS,
    ...summarizeDirectory({ profiles, records, demand }),
    requests: summarizeWorkRequests(requests),
    growth,
    growthSources,
    includeTeam,
  });
}
