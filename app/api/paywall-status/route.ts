import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_PAYWALL_ENABLED,
  PAYWALL_SETTING_KEY,
  isMissingTableError,
  resolvePaywallEnabled,
  resolvePaywallUpdatedAt,
} from '@/lib/paywall-config';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({
      enabled: DEFAULT_PAYWALL_ENABLED,
      updatedAt: null,
      source: 'fallback',
    });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value_json,updated_at')
      .eq('key', PAYWALL_SETTING_KEY)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({
          enabled: DEFAULT_PAYWALL_ENABLED,
          updatedAt: null,
          source: 'missing_table',
        });
      }

      return NextResponse.json({
        enabled: DEFAULT_PAYWALL_ENABLED,
        updatedAt: null,
        source: 'error',
      });
    }

    return NextResponse.json({
      enabled: resolvePaywallEnabled(data),
      updatedAt: resolvePaywallUpdatedAt(data),
      source: 'database',
    });
  } catch {
    return NextResponse.json({
      enabled: DEFAULT_PAYWALL_ENABLED,
      updatedAt: null,
      source: 'exception',
    });
  }
}
