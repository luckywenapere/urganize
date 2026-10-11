import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requireActiveAuthenticatedUser } from '@/app/api/_shared/auth';
import { parsePromoSuggestion } from '@/lib/promo-channels';
import { createPromoSuggestion } from '@/lib/promo-channels-server';

/**
 * POST /api/promo-channels/suggestions: a team member suggests a promo channel.
 *
 * It lands as a `pending` row and is listed only when an admin approves it at
 * /admin/promo-channels. Nothing a person types reaches the directory without
 * that review. At most 10 waiting per person.
 */
export async function POST(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const parsed = parsePromoSuggestion(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const result = await createPromoSuggestion(admin, auth.user.id, parsed.value);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
