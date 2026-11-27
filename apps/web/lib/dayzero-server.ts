// Day Zero lifetime deals (#1393). SERVER ONLY: talks to dayzero.ltd and to
// the dayzero_licenses table. The rules are pure in lib/dayzero.ts.
//
// Env (set on Vercel, never in the repo): DAYZERO_CLIENT_ID,
// DAYZERO_CLIENT_SECRET, DAYZERO_API_KEY, DAYZERO_ORIGIN (https://dayzero.ltd).

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hasLiveCardPlan,
  isLicenseKey,
  planCoversLifetime,
  nextLicenseStatus,
  type DayzeroLicenseStatus,
  type DayzeroWebhookPayload,
  type LicenseRow,
} from './dayzero';
import { invalidateSubscriptionSnapshot } from './subscription-access';
import { invalidateTeamAccess } from './team-billing-server';
import { logBillingEvent } from './billing-events-server';
import { notifyFounder } from './billing-alerts-server';

const TABLE = 'dayzero_licenses';
const FETCH_TIMEOUT_MS = 10_000;

export type DayzeroConfig = {
  clientId: string;
  clientSecret: string;
  apiKey: string;
  origin: string;
};

export function readDayzeroConfig(): DayzeroConfig | null {
  const clientId = process.env.DAYZERO_CLIENT_ID?.trim();
  const clientSecret = process.env.DAYZERO_CLIENT_SECRET?.trim();
  const apiKey = process.env.DAYZERO_API_KEY?.trim();
  const origin = (process.env.DAYZERO_ORIGIN?.trim() || 'https://dayzero.ltd').replace(/\/+$/, '');
  if (!clientId || !clientSecret || !apiKey) return null;
  return { clientId, clientSecret, apiKey, origin };
}

// ── OAuth: code → access token → license ────────────────────────────────────

async function fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' });
    if (!response.ok) {
      console.warn('[dayzero] request failed', new URL(url).pathname, response.status);
      return null;
    }
    const body = (await response.json().catch(() => null)) as unknown;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch (error) {
    console.warn('[dayzero] request error', new URL(url).pathname, error instanceof Error ? error.message : error);
    return null;
  }
}

/** Swap a one-time code for an access token. Null when the code is used,
 * expired or refused. The token is never logged or stored. */
export async function exchangeDayzeroCode(
  config: DayzeroConfig,
  code: string,
  redirectUri: string
): Promise<string | null> {
  const body = await fetchJson(`${config.origin}/openid/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  const token = body?.access_token;
  return typeof token === 'string' && token ? token : null;
}

export async function fetchDayzeroLicense(
  config: DayzeroConfig,
  accessToken: string
): Promise<{ licenseKey: string; status: string } | null> {
  const url = `${config.origin}/openid/license_key?access_token=${encodeURIComponent(accessToken)}`;
  const body = await fetchJson(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const key = typeof body?.license_key === 'string' ? body.license_key.trim().toLowerCase() : '';
  if (!isLicenseKey(key)) return null;
  return { licenseKey: key, status: typeof body?.status === 'string' ? body.status : '' };
}

// ── Rows ────────────────────────────────────────────────────────────────────

type DbRow = {
  license_key: string;
  status: DayzeroLicenseStatus;
  user_id: string | null;
  last_event_ms: number | string | null;
};

const toLicenseRow = (row: DbRow): LicenseRow => ({
  status: row.status,
  userId: row.user_id,
  lastEventMs: row.last_event_ms === null ? null : Number(row.last_event_ms),
});

async function readRow(admin: SupabaseClient, licenseKey: string): Promise<DbRow | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select('license_key, status, user_id, last_event_ms')
    .eq('license_key', licenseKey)
    .maybeSingle();
  if (error) throw new Error(`dayzero read failed: ${error.message}`);
  return (data as DbRow | null) ?? null;
}

function forgetAccess(userId: string | null) {
  if (!userId) return;
  invalidateSubscriptionSnapshot(userId);
  invalidateTeamAccess(userId);
}

/**
 * Move one license to `target` if the rule allows it. Compare-and-set on the
 * status it read (docs/state-machines.md), retried once if someone else moved
 * it first. Returns the row's user (for cache invalidation) or null.
 */
async function moveLicense(
  admin: SupabaseClient,
  input: {
    licenseKey: string;
    event: 'activate' | 'deactivate';
    eventMs: number;
    tier?: number | null;
    reason?: string | null;
    userId?: string | null;
    prevLicenseKey?: string | null;
    lastEventName?: string;
  }
): Promise<{ changed: boolean; userId: string | null }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await readRow(admin, input.licenseKey);
    const target = nextLicenseStatus(current ? toLicenseRow(current) : null, input.event);
    if (!target) return { changed: false, userId: current?.user_id ?? null };

    const fields: Record<string, unknown> = {
      status: target,
      last_event: input.lastEventName ?? input.event,
      last_event_ms: input.eventMs,
    };
    if (input.tier !== undefined && input.tier !== null) fields.tier = input.tier;
    if (input.prevLicenseKey) fields.prev_license_key = input.prevLicenseKey;
    if (target === 'deactivated') {
      fields.deactivated_at = new Date().toISOString();
      fields.deactivate_reason = input.reason ?? null;
    }
    // Moving a plan from an old license carries its owner over.
    if (input.userId && !current?.user_id) {
      fields.user_id = input.userId;
      fields.attached_at = new Date().toISOString();
    }

    if (!current) {
      const { error } = await admin.from(TABLE).insert({ license_key: input.licenseKey, ...fields });
      if (!error) return { changed: true, userId: (fields.user_id as string | undefined) ?? null };
      if (error.code !== '23505') throw new Error(`dayzero insert failed: ${error.message}`);
      continue; // Someone inserted it first: read again and decide again.
    }

    const { data, error } = await admin
      .from(TABLE)
      .update(fields)
      .eq('license_key', input.licenseKey)
      .eq('status', current.status)
      .select('user_id');
    if (error) throw new Error(`dayzero update failed: ${error.message}`);
    if (data && data.length > 0) {
      return { changed: true, userId: (data[0] as { user_id: string | null }).user_id };
    }
  }
  return { changed: false, userId: null };
}

/** Apply one verified, non-test webhook event. Throws on a database error so
 * the route can answer 500 and Day Zero retries. */
export async function applyDayzeroWebhook(admin: SupabaseClient, event: DayzeroWebhookPayload): Promise<void> {
  const { licenseKey, eventTimestamp: eventMs } = event;

  if (event.event === 'purchase') {
    const { error } = await admin.from(TABLE).upsert(
      {
        license_key: licenseKey,
        status: 'inactive',
        tier: event.tier,
        last_event: 'purchase',
        last_event_ms: eventMs,
      },
      { onConflict: 'license_key', ignoreDuplicates: true }
    );
    if (error) throw new Error(`dayzero purchase failed: ${error.message}`);
    return;
  }

  if (event.event === 'activate') {
    const moved = await moveLicense(admin, { licenseKey, event: 'activate', eventMs, tier: event.tier });
    forgetAccess(moved.userId);
    return;
  }

  if (event.event === 'deactivate') {
    const moved = await moveLicense(admin, {
      licenseKey,
      event: 'deactivate',
      eventMs,
      reason: event.reason,
    });
    forgetAccess(moved.userId);
    if (moved.changed && moved.userId) await logOwnerEvent(admin, moved.userId, 'dayzero_refunded', { licenseKey });
    return;
  }

  // upgrade / downgrade / migrate: the plan moves from the old license to the
  // new one. Every tier gives Solo Plus today, so this only keeps the owner on it.
  const prev = event.prevLicenseKey ? await readRow(admin, event.prevLicenseKey) : null;
  const moved = await moveLicense(admin, {
    licenseKey,
    event: 'activate',
    eventMs,
    tier: event.tier,
    userId: prev?.user_id ?? null,
    prevLicenseKey: event.prevLicenseKey,
    lastEventName: event.event,
  });
  if (prev && event.prevLicenseKey) {
    const old = await moveLicense(admin, {
      licenseKey: event.prevLicenseKey,
      event: 'deactivate',
      eventMs,
      reason: `${event.event} to ${licenseKey}`,
      lastEventName: event.event,
    });
    forgetAccess(old.userId);
  }
  forgetAccess(moved.userId);
}

/**
 * Day Zero just told us (over OAuth) this license is active. Our clock is not
 * Day Zero's, so this never stamps last_event_ms (a refund webhook must always
 * be able to land after it), and it never brings back a refunded license: the
 * webhook is the authority on refunds.
 */
export async function markDayzeroLicenseActive(admin: SupabaseClient, licenseKey: string): Promise<void> {
  const { error: insertError } = await admin
    .from(TABLE)
    .upsert(
      { license_key: licenseKey, status: 'active', last_event: 'oauth' },
      { onConflict: 'license_key', ignoreDuplicates: true }
    );
  if (insertError) throw new Error(`dayzero activate failed: ${insertError.message}`);
  const { data, error } = await admin
    .from(TABLE)
    .update({ status: 'active', last_event: 'oauth' })
    .eq('license_key', licenseKey)
    .eq('status', 'inactive')
    .select('user_id');
  if (error) throw new Error(`dayzero activate failed: ${error.message}`);
  forgetAccess((data?.[0] as { user_id: string | null } | undefined)?.user_id ?? null);
}

export type AttachResult = 'attached' | 'other_account' | 'expired' | 'error';

/**
 * Attach a license to an account. One license, one account: the update only
 * matches a row with no owner yet (or this owner), so two accounts racing for
 * the same license cannot both win.
 */
export async function attachDayzeroLicense(
  admin: SupabaseClient,
  userId: string,
  licenseKey: string
): Promise<AttachResult> {
  try {
    const row = await readRow(admin, licenseKey);
    if (!row || row.status !== 'active') return 'expired';
    if (row.user_id && row.user_id !== userId) return 'other_account';
    if (row.user_id === userId) {
      forgetAccess(userId);
      return 'attached';
    }

    const { data, error } = await admin
      .from(TABLE)
      .update({ user_id: userId, attached_at: new Date().toISOString() })
      .eq('license_key', licenseKey)
      .eq('status', 'active')
      .is('user_id', null)
      .select('license_key');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      const again = await readRow(admin, licenseKey);
      if (again?.user_id === userId && again.status === 'active') return 'attached';
      return again?.user_id ? 'other_account' : 'expired';
    }

    forgetAccess(userId);
    await afterFirstAttach(admin, userId, licenseKey);
    return 'attached';
  } catch (error) {
    console.warn('[dayzero] attach failed', error instanceof Error ? error.message : error);
    return 'error';
  }
}

// ── Founder ledger and the card-plan email ──────────────────────────────────

async function ownedWorkspaceId(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  const id = (data?.[0] as { id?: string } | undefined)?.id;
  return id ?? null;
}

async function logOwnerEvent(
  admin: SupabaseClient,
  userId: string,
  type: 'dayzero_activated' | 'dayzero_refunded',
  metadata: Record<string, unknown>
) {
  try {
    const workspaceId = await ownedWorkspaceId(admin, userId);
    if (!workspaceId) return; // A brand-new account has no team yet.
    await logBillingEvent(admin, { workspaceId, ownerUserId: userId, actorUserId: userId, type, metadata });
  } catch {
    // The ledger is a record, never a reason to fail the claim.
  }
}

async function afterFirstAttach(admin: SupabaseClient, userId: string, licenseKey: string) {
  await logOwnerEvent(admin, userId, 'dayzero_activated', { licenseKey });
  try {
    const { data } = await admin
      .from('subscriptions')
      .select('status, expires_at, plan')
      .eq('user_id', userId)
      .maybeSingle();
    const row = data as { status: string | null; expires_at: string | null; plan: string | null } | null;
    if (!hasLiveCardPlan(row)) return;
    const workspaceId = await ownedWorkspaceId(admin, userId);
    if (!workspaceId) return;
    await notifyFounder(admin, {
      kind: 'dayzero_card_plan_cancel_needed',
      workspaceId,
      ownerUserId: userId,
      actorUserId: userId,
      // A card plan at or above Solo Plus (Pro, Pro Plus, Label) is worth more
      // than the license: cancelling it would drop them to Solo Plus (#1419).
      note: `Card plan: ${row?.plan ?? 'unknown'}, renews ${row?.expires_at ?? 'unknown'}. Day Zero license ${licenseKey}.${
        planCoversLifetime(row?.plan) ? ' This card plan is already at or above Solo Plus: cancelling it drops them to Solo Plus, so ask them first.' : ''
      }`,
    });
  } catch {
    // notifyFounder never throws; this guards the subscription read.
  }
}
