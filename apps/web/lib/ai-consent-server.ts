import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { aiConsentRefusalBody, hasAiConsent, isAiConsentEnabled } from '@/lib/ai-consent';

/**
 * The server side of AI permission (see lib/ai-consent.ts).
 *
 * Every route that sends a person's words to an AI calls `aiConsentRefusal`
 * right after it knows who they are and before it spends anything. Hiding the
 * button is not the gate: a request made directly must get the same answer.
 *
 * It FAILS OPEN on anything it cannot read (the column not applied yet, a
 * database blip). That is the repo's rule for every counter and gate that is
 * not a security boundary, and here a wrongly blocked person loses their
 * assistant while a wrongly allowed one has not been harmed more than before
 * this existed. With the flag off nothing is read at all.
 */
export async function hasUserAiConsent(
  adminClient: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (!isAiConsentEnabled()) return true;
  try {
    const { data, error } = await adminClient
      .from('profiles')
      .select('ai_consent_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[ai-consent] could not read consent, allowing:', error.message ?? error);
      return true;
    }
    // No profile row: nothing to ask about yet, other gates deal with that.
    if (!data) return true;
    return hasAiConsent((data as { ai_consent_at?: string | null }).ai_consent_at);
  } catch (error) {
    console.warn('[ai-consent] consent read threw, allowing:', error);
    return true;
  }
}

/** null means "go ahead"; otherwise the 403 to return straight away. */
export async function aiConsentRefusal(
  adminClient: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  if (await hasUserAiConsent(adminClient, userId)) return null;
  return NextResponse.json(aiConsentRefusalBody(), { status: 403 });
}
