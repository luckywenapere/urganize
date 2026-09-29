import type { SupabaseClient } from '@supabase/supabase-js';
import type { UnsubscribeScope } from './unsubscribe';

// Reads and writes email_suppressions. Server-only (service-role client passed
// in). Never throws.
//
// The two directions fail differently on purpose:
//   * isSuppressed FAILS OPEN — an unreadable table means "not suppressed", so an
//     outage or a table not yet applied never stops mail. Only optional
//     categories consult it, so the downside is one extra optional email.
//   * addSuppression reports whether it landed, because the unsubscribe page
//     must not tell someone they are unsubscribed when the write failed.

export const EMAIL_SUPPRESSIONS_TABLE = 'email_suppressions';

export type SuppressionScope = 'all' | UnsubscribeScope;
export type SuppressionReason = 'unsubscribe' | 'bounce' | 'complaint';

const normalise = (email: string) => email.trim().toLowerCase();

export async function isSuppressed(
  admin: SupabaseClient,
  email: string,
  category: UnsubscribeScope
): Promise<boolean> {
  try {
    const { data, error } = await admin
      .from(EMAIL_SUPPRESSIONS_TABLE)
      .select('id')
      .eq('email', normalise(email))
      .in('scope', ['all', category])
      .limit(1);
    if (error) {
      console.error('[email-suppression] read failed', error.message);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error('[email-suppression] read threw', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function addSuppression(
  admin: SupabaseClient,
  email: string,
  scope: SuppressionScope,
  reason: SuppressionReason
): Promise<boolean> {
  try {
    const { error } = await admin
      .from(EMAIL_SUPPRESSIONS_TABLE)
      .upsert(
        { email: normalise(email), scope, reason },
        { onConflict: 'email,scope', ignoreDuplicates: true }
      );
    if (error) {
      console.error('[email-suppression] write failed', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[email-suppression] write threw', error instanceof Error ? error.message : error);
    return false;
  }
}
