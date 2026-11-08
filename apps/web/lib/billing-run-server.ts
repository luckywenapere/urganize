import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSavedCard, runAddonRenewals, type RenewalSummary } from './addons-server';
import { chargeEndedOverage, type OverageRunSummary } from './credits/overage-server';
import { isPaystackConfigured } from './paystack-server';

// The once-a-day money run (#1112): add-on renewals, then credits past the
// allowance for every credit window that ended. A passenger on the due-date
// cron (two Hobby schedule slots, both taken). Never throws.

async function ownerEmail(admin: SupabaseClient, workspaceId: string): Promise<string | null> {
  const team = await admin.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
  const ownerId = (team.data as { owner_id: string | null } | null)?.owner_id;
  if (!ownerId) return null;
  const user = await admin.auth.admin.getUserById(ownerId).catch(() => null);
  return user?.data?.user?.email?.toLowerCase() ?? null;
}

export function cardLoader(admin: SupabaseClient) {
  return async (workspaceId: string) => loadSavedCard(admin, workspaceId, await ownerEmail(admin, workspaceId));
}

export async function runDailyBilling(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ addons: RenewalSummary | null; overage: OverageRunSummary | null; skipped?: string }> {
  if (!isPaystackConfigured()) return { addons: null, overage: null, skipped: 'paystack not configured' };
  let addons: RenewalSummary | null = null;
  let overage: OverageRunSummary | null = null;
  try {
    addons = await runAddonRenewals(admin, now);
  } catch (error) {
    console.error('[billing-run] add-on renewals threw:', error);
  }
  try {
    overage = await chargeEndedOverage(admin, cardLoader(admin), now);
  } catch (error) {
    console.error('[billing-run] overage threw:', error);
  }
  return { addons, overage };
}
