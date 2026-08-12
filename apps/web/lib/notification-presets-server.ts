// SERVER ONLY — reads/writes the notification presets row in app_settings.
// app_settings is RLS-enabled with zero policies (service-role only by
// design — see the schema reconciliation migration), which is exactly the
// access model presets need: read by server-side senders (release
// reminders, the weekly motivational sweep, the deadline-tier sweep), and
// written only from /admin/notification-presets.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeNotificationPresets, type NotificationPresets } from '@/lib/notification-presets';

export const APP_SETTINGS_TABLE = 'app_settings';
export const NOTIFICATION_PRESETS_KEY = 'notification_presets';

/** Reads the effective presets. Zero rows (never edited), a missing table,
 * or any read error all fall back to defaults via normalizeNotificationPresets(null)
 * — so every consumer works before an admin ever opens the settings page. */
export async function getNotificationPresets(adminClient: SupabaseClient): Promise<NotificationPresets> {
  try {
    const { data, error } = await adminClient
      .from(APP_SETTINGS_TABLE)
      .select('value_json')
      .eq('key', NOTIFICATION_PRESETS_KEY)
      .maybeSingle();

    if (error || !data) {
      return normalizeNotificationPresets(null);
    }
    return normalizeNotificationPresets(data.value_json);
  } catch (error) {
    console.error('[notification-presets] getNotificationPresets failed', error);
    return normalizeNotificationPresets(null);
  }
}

export async function saveNotificationPresets(
  adminClient: SupabaseClient,
  presets: NotificationPresets,
  updatedBy: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await adminClient.from(APP_SETTINGS_TABLE).upsert(
      {
        key: NOTIFICATION_PRESETS_KEY,
        value_json: presets,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    console.error('[notification-presets] saveNotificationPresets failed', error);
    return { ok: false, error: 'Could not save notification presets.' };
  }
}
