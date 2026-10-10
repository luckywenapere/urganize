import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseRemovalContact, parseRemovalNote } from '@/lib/claim';
import { requestRemoval } from '@/lib/claim-server';

// The public "Remove this profile" form on an unclaimed page.
//
// No session, so no auth. It ALWAYS answers the same thing, whether the page
// exists, was already removed or never did: a stranger must not be able to
// learn which handles are real by trying them. The page is hidden at once and a
// request waits in the admin queue, due within three days.

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid request body.' }, { status: 400 });
  }
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const contact = parseRemovalContact(body.contact);
  if (!slug || slug.length > 80) return NextResponse.json({ error: 'Send a valid request body.' }, { status: 400 });
  if (!contact) return NextResponse.json({ error: 'Add an email or a phone number so we can reach you.' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) {
    const admin = createClient(url, key, { auth: { persistSession: false } });
    await requestRemoval(admin, { slug, contact, note: parseRemovalNote(body.note) });
  }
  return NextResponse.json({ ok: true });
}
