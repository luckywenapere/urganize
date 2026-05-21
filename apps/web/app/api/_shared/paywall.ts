import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSubscriptionSnapshot } from '@/lib/subscription-access';
import {
  DEFAULT_PAYWALL_ENABLED,
  PAYWALL_SETTING_KEY,
  isMissingTableError,
  resolvePaywallEnabled,
} from '@/lib/paywall-config';

export const PAYWALL_RESPONSE_CODE = 'PAYWALL_REQUIRED';

type RequirePaidAccessOptions = {
  feature: string;
  message: string;
};

async function isPaywallEnabled(): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return DEFAULT_PAYWALL_ENABLED;
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value_json,updated_at')
      .eq('key', PAYWALL_SETTING_KEY)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) return DEFAULT_PAYWALL_ENABLED;
      return DEFAULT_PAYWALL_ENABLED;
    }

    return resolvePaywallEnabled(data);
  } catch {
    return DEFAULT_PAYWALL_ENABLED;
  }
}

export async function requirePaidAccess(
  userId: string,
  options: RequirePaidAccessOptions
) {
  const paywallEnabled = await isPaywallEnabled();
  if (!paywallEnabled) {
    return null;
  }

  const snapshot = await getSubscriptionSnapshot(userId);
  if (snapshot.hasAccess) {
    return null;
  }

  return NextResponse.json(
    {
      error: options.message,
      code: PAYWALL_RESPONSE_CODE,
      feature: options.feature,
    },
    { status: 403 }
  );
}
