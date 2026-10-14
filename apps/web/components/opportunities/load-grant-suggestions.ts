'use client';

import { supabase } from '@/lib/supabase/client';
import type { GrantSuggestionView } from '@/lib/grants/suggestions';

/**
 * The team's new grant suggestions, from the route the Opportunities page's
 * strip reads. Shared with Home's Opportunities card (URG-266) so both read the
 * same list the same way. `ok` is false when the list could not be read
 * (signed out, the flag off, an artist-scoped teammate, offline).
 */
export async function loadGrantSuggestions(): Promise<{ ok: boolean; suggestions: GrantSuggestionView[] }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return { ok: false, suggestions: [] };
  try {
    const response = await fetch('/api/opportunities/grant-suggestions', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false, suggestions: [] };
    const body = (await response.json()) as { suggestions?: GrantSuggestionView[] };
    return { ok: true, suggestions: Array.isArray(body.suggestions) ? body.suggestions : [] };
  } catch {
    return { ok: false, suggestions: [] };
  }
}
