import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { PRESENCE_TABLE, presenceDay } from '@/lib/presence';
import {
  EMPTY_NPS_STATE,
  NPS_DRAFT_KEY,
  NPS_SCOPE,
  applyNpsAction,
  categorizeNpsScore,
  decideNpsEligibility,
  isValidNpsScore,
  latestNpsResponse,
  normalizeNpsState,
  type NpsAction,
  type NpsState,
} from '@/lib/nps';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

// Net Promoter Score (2026-10-11). The rules live in lib/nps.ts; this route
// reads and writes one ui_state_drafts row per user and reports to PostHog.
//
// OPEN ROUTE, ON PURPOSE (the /api/presence reasoning): getAuthenticatedUser,
// never the paywall wrapper. A team on the wall or in read-only mode is exactly
// whose score matters, and this must never answer 402, which
// lib/access-redirect.ts would turn into a redirect to /locked.
//
// NEVER BREAKS HOME: every failure on GET answers { eligible: false }.
//
// Kill switch: NPS_PROMPT_OFF=true (server env) stops anyone being asked.
// Answers already given stay readable at /admin/nps.

export const dynamic = 'force-dynamic';

const TABLE = 'ui_state_drafts';
const ACTIVITY_LOOKBACK_DAYS = 365;
const ROW_CAP = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

const notEligible = () => NextResponse.json({ eligible: false });

async function readState(admin: SupabaseClient, userId: string): Promise<NpsState> {
  const { data, error } = await admin
    .from(TABLE)
    .select('payload_json')
    .eq('user_id', userId)
    .eq('draft_key', NPS_DRAFT_KEY)
    .maybeSingle();
  if (error) throw error;
  return normalizeNpsState((data as { payload_json?: unknown } | null)?.payload_json ?? EMPTY_NPS_STATE);
}

async function writeState(admin: SupabaseClient, userId: string, state: NpsState) {
  const { error } = await admin.from(TABLE).upsert(
    {
      user_id: userId,
      draft_key: NPS_DRAFT_KEY,
      scope: NPS_SCOPE,
      payload_json: state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,draft_key' }
  );
  if (error) throw error;
}

/**
 * Distinct Lagos days this person did something in Urganize, from every
 * source that records it. Each source is optional: a table that is missing
 * (user_presence_days was not applied everywhere when this shipped) or a read
 * that fails simply contributes nothing.
 */
async function countActiveDays(admin: SupabaseClient, userId: string, nowMs: number): Promise<number> {
  const since = new Date(nowMs - ACTIVITY_LOOKBACK_DAYS * DAY_MS).toISOString();
  const days = new Set<string>();
  const toDay = (iso: unknown) => {
    if (typeof iso !== 'string') return;
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) days.add(presenceDay(new Date(ms)));
  };

  const reads: Array<PromiseLike<void>> = [
    admin
      .from(PRESENCE_TABLE)
      .select('day')
      .eq('user_id', userId)
      .gte('day', since.slice(0, 10))
      .limit(ROW_CAP)
      .then(({ data }) => {
        for (const row of (data ?? []) as Array<{ day?: unknown }>) {
          if (typeof row.day === 'string') days.add(row.day.slice(0, 10));
        }
      }),
    admin
      .from('task_activity')
      .select('created_at')
      .eq('actor_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(ROW_CAP)
      .then(({ data }) => {
        for (const row of (data ?? []) as Array<{ created_at?: unknown }>) toDay(row.created_at);
      }),
    admin
      .from('activity_logs')
      .select('created_at')
      .eq('actor_user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(ROW_CAP)
      .then(({ data }) => {
        for (const row of (data ?? []) as Array<{ created_at?: unknown }>) toDay(row.created_at);
      }),
  ];
  await Promise.all(reads.map((read) => Promise.resolve(read).catch(() => undefined)));
  return days.size;
}

async function isCuratorOnly(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  return (data as { role?: string | null } | null)?.role === 'curator';
}

function accountAgeDays(createdAt: string | undefined, nowMs: number): number {
  const ms = Date.parse(createdAt ?? '');
  return Number.isNaN(ms) ? 0 : Math.max(0, Math.floor((nowMs - ms) / DAY_MS));
}

export async function GET(request: NextRequest) {
  if (process.env.NPS_PROMPT_OFF === 'true') return notEligible();
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return notEligible();

  try {
    const nowMs = Date.now();
    const [state, curator, activeDays] = await Promise.all([
      readState(admin, auth.user.id),
      isCuratorOnly(admin, auth.user.id),
      countActiveDays(admin, auth.user.id, nowMs),
    ]);
    if (curator) return notEligible();
    const decision = decideNpsEligibility({
      state,
      nowMs,
      signupMs: Date.parse(auth.user.created_at ?? ''),
      activeDays,
    });
    return NextResponse.json({ eligible: decision.eligible });
  } catch (error) {
    console.warn('[nps] eligibility check failed', error);
    return notEligible();
  }
}

function parseAction(body: Record<string, unknown>): NpsAction | null {
  switch (body.action) {
    case 'shown':
      return { type: 'shown' };
    case 'dismiss':
      return { type: 'dismiss' };
    case 'score':
      return isValidNpsScore(body.score)
        ? { type: 'score', score: body.score, surface: typeof body.surface === 'string' ? body.surface.slice(0, 40) : 'home' }
        : null;
    case 'reason':
      return typeof body.reason === 'string' && body.reason.trim() ? { type: 'reason', reason: body.reason } : null;
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = parseAction(body);
  if (!action) return NextResponse.json({ error: 'Invalid NPS action.' }, { status: 400 });

  const posthog = createServerPostHogClient();
  try {
    const nowMs = Date.now();
    const current = await readState(admin, auth.user.id);
    const next = applyNpsAction(current, action, new Date(nowMs).toISOString());
    await writeState(admin, auth.user.id, next);

    const ageDays = accountAgeDays(auth.user.created_at, nowMs);
    if (action.type === 'shown') {
      captureServerAnalyticsEvent(posthog, auth.user.id, createPostHogEvent('nps_shown', { account_age_days: ageDays }));
    } else if (action.type === 'dismiss') {
      captureServerAnalyticsEvent(
        posthog,
        auth.user.id,
        createPostHogEvent('nps_dismissed', { dismissals_in_a_row: next.dismissalsInARow })
      );
    } else if (action.type === 'score') {
      captureServerAnalyticsEvent(
        posthog,
        auth.user.id,
        createPostHogEvent('nps_submitted', {
          score: action.score,
          category: categorizeNpsScore(action.score),
          account_age_days: ageDays,
          surface: action.surface,
        })
      );
    } else {
      const latest = latestNpsResponse(next);
      if (latest) {
        captureServerAnalyticsEvent(
          posthog,
          auth.user.id,
          createPostHogEvent('nps_reason_added', {
            score: latest.score,
            category: categorizeNpsScore(latest.score),
            reason_length: latest.reason.length,
          })
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[nps] could not save', error);
    return NextResponse.json({ error: 'Could not save your answer.' }, { status: 500 });
  } finally {
    await shutdownServerAnalytics(posthog);
  }
}
