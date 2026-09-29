import type { SupabaseClient } from '@supabase/supabase-js';
import { EMAIL_LOG_TABLE, type EmailLogStatus } from './log-server';
import { addSuppression } from './suppression-server';
import {
  isPermanentBounce,
  recipientOf,
  shouldAdvanceStatus,
  statusForEvent,
  type ResendEvent,
} from './webhook';

// Applies one verified Resend event to email_log and, for a permanent bounce or a
// spam complaint, to email_suppressions. Never throws, and returns whether the
// event was handled so the route can tell Resend to retry only a real failure.

export async function applyResendEvent(
  admin: SupabaseClient,
  event: ResendEvent
): Promise<{ handled: boolean }> {
  const next = statusForEvent(event.type);
  if (!next) return { handled: true };

  const resendId = event.data?.email_id;
  if (!resendId) return { handled: true };

  try {
    const { data: row, error } = await admin
      .from(EMAIL_LOG_TABLE)
      .select('id, status')
      .eq('resend_id', resendId)
      .maybeSingle();
    if (error) {
      console.error('[email-webhook] lookup failed', error.message);
      return { handled: false };
    }

    if (row && shouldAdvanceStatus((row as { status: EmailLogStatus }).status, next)) {
      const { error: updateError } = await admin
        .from(EMAIL_LOG_TABLE)
        .update({ status: next })
        .eq('id', (row as { id: string }).id);
      if (updateError) {
        console.error('[email-webhook] update failed', updateError.message);
        return { handled: false };
      }
    }

    // A suppression is a fact about the address, so it is written even when the
    // log row is missing (a send from before email_log existed) or already ahead.
    const address = recipientOf(event);
    const suppress =
      event.type === 'email.complained' ||
      (event.type === 'email.bounced' && isPermanentBounce(event));
    if (address && suppress) {
      const ok = await addSuppression(
        admin,
        address,
        'all',
        event.type === 'email.complained' ? 'complaint' : 'bounce'
      );
      if (!ok) return { handled: false };
    }

    return { handled: true };
  } catch (error) {
    console.error('[email-webhook] threw', error instanceof Error ? error.message : error);
    return { handled: false };
  }
}
