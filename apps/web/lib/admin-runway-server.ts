import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminReadSource } from './admin-read-server';
import { readStoredRunway, RUNWAY_SETTINGS_KEY, type RunwayInput, type RunwaySettings } from './admin-runway';

// Where the founder's runway figures live (iteration 6, 2026-10-10): one row in
// public.app_settings, key RUNWAY_SETTINGS_KEY. That table is the schema's
// designated home for service-role-only settings (migration
// 20260611_drop_global_paywall_setting.sql says so): RLS is on with NO
// policies, so only the service-role client reaches it, and nothing new had to
// be migrated. The only callers are admin routes that passed verifyAdmin.
//
// The only write anywhere in this pass: the founder's own figures, saved or
// cleared from the cockpit's form.

const TABLE = 'app_settings';
const SOURCE_NAME = 'app_settings (runway)';

export async function readRunwaySettings(
  client: SupabaseClient,
  now: Date
): Promise<{ settings: RunwaySettings | null; source: AdminReadSource }> {
  try {
    const { data, error } = await client.from(TABLE).select('value_json').eq('key', RUNWAY_SETTINGS_KEY).maybeSingle();
    if (error) {
      return { settings: null, source: { table: SOURCE_NAME, rows: 0, status: 'error', truncated: false, message: error.message } };
    }
    const value = (data as { value_json?: unknown } | null)?.value_json ?? null;
    return {
      settings: value ? readStoredRunway(value, now) : null,
      source: { table: SOURCE_NAME, rows: value ? 1 : 0, status: 'ok', truncated: false },
    };
  } catch (error) {
    return {
      settings: null,
      source: {
        table: SOURCE_NAME,
        rows: 0,
        status: 'error',
        truncated: false,
        message: error instanceof Error ? error.message : 'read failed',
      },
    };
  }
}

export async function saveRunwaySettings(
  client: SupabaseClient,
  value: RunwayInput,
  adminUserId: string,
  now: Date
): Promise<{ ok: true; settings: RunwaySettings } | { ok: false; error: string }> {
  const settings: RunwaySettings = { ...value, updatedAt: now.toISOString() };
  const { error } = await client
    .from(TABLE)
    .upsert({ key: RUNWAY_SETTINGS_KEY, value_json: settings, updated_by: adminUserId }, { onConflict: 'key' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, settings };
}

export async function clearRunwaySettings(client: SupabaseClient): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.from(TABLE).delete().eq('key', RUNWAY_SETTINGS_KEY);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
