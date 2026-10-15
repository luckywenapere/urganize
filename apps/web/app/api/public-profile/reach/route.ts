import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { resolveRelationshipsContext } from '@/app/api/relationships/_shared';
import { loadWorkspaceAccessContext } from '@/lib/tasks-server';
import { isPubliclyReadable } from '@/lib/person-public';
import type { DirectoryRole } from '@/lib/directory-roles';

// Reach and save on a claimed /p/{slug} page (URG-305).
//
// The page is server-rendered with no session and never puts a user id in its
// HTML, so the buttons ask here after it draws, signed in, by slug:
//
//   GET  ?slug=  who to reach (the recipient the work-request sheet needs),
//                whether this is the reader's own page, and whether their team
//                already saved this person.
//   POST {slug}  saves the person to the reader's team contacts (the private
//                Relationships layer), pointing at the existing profile, never
//                making a second one.
//
// Only a PUBLIC, CLAIMED profile answers; everything else is the same 404, the
// rule the page itself follows.

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row => (value && typeof value === 'object' ? (value as Row) : {});
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const notFound = () => NextResponse.json({ error: 'Not found.' }, { status: 404 });
const noStore = { 'cache-control': 'no-store' };

async function loadPublicProfile(admin: SupabaseClient, raw: unknown) {
  const slug = text(raw).trim().toLowerCase();
  if (!slug || slug.length > 80) return null;
  const { data } = await admin
    .from('person_profiles')
    .select('id, user_id, display_name, roles, visibility')
    .eq('slug', slug)
    .maybeSingle();
  const row = asRow(data);
  if (!data || !row.user_id || !isPubliclyReadable(text(row.visibility) as never)) return null;
  const roles = Array.isArray(row.roles) ? (row.roles as unknown[]).filter((r): r is string => typeof r === 'string') : [];
  return {
    personId: text(row.id),
    userId: text(row.user_id),
    displayName: text(row.display_name),
    role: (roles[0] as DirectoryRole | undefined) ?? null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const person = await loadPublicProfile(admin, new URL(request.url).searchParams.get('slug'));
  if (!person) return notFound();
  if (person.userId === auth.user.id) return NextResponse.json({ self: true }, { headers: noStore });

  let saved = false;
  try {
    const access = await loadWorkspaceAccessContext(admin, auth.user);
    if (access.primaryWorkspaceId) {
      const { data } = await admin
        .from('team_relationships')
        .select('id')
        .eq('workspace_id', access.primaryWorkspaceId)
        .eq('person_id', person.personId)
        .maybeSingle();
      saved = Boolean(data);
    }
  } catch {
    saved = false;
  }

  return NextResponse.json(
    {
      self: false,
      saved,
      recipient: { userId: person.userId, displayName: person.displayName, role: person.role },
    },
    { headers: noStore }
  );
}

export async function POST(request: NextRequest) {
  const resolved = await resolveRelationshipsContext(request, { write: true });
  if ('error' in resolved) return resolved.error;
  const { adminClient, workspaceId, userId } = resolved.context;

  const body = (await request.json().catch(() => ({}))) as Row;
  const person = await loadPublicProfile(adminClient, body.slug);
  if (!person) return notFound();
  if (person.userId === userId) return NextResponse.json({ error: 'This is your own page.' }, { status: 400 });

  const existing = await adminClient
    .from('team_relationships')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('person_id', person.personId)
    .maybeSingle();
  if (existing.data) return NextResponse.json({ saved: true }, { headers: noStore });

  const inserted = await adminClient.from('team_relationships').insert({
    workspace_id: workspaceId,
    person_id: person.personId,
    label: person.displayName.slice(0, 80) || 'Contact',
    role: (person.role ?? '').slice(0, 40),
    source: 'manual',
    created_by: userId,
  });
  // Unique on (team, person): a second tap at the same moment already saved it.
  if (inserted.error && inserted.error.code !== '23505') {
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
  }
  return NextResponse.json({ saved: true }, { status: 201, headers: noStore });
}
