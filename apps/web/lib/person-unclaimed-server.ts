import { createClient } from '@supabase/supabase-js';
import { RELEASE_CREDIT_ROLE_LABELS, type ReleaseCreditRole } from '@/types/credits';
import { loadPersonCredits } from './claim-server';

/**
 * What a stranger may read at /p/{slug} for somebody who has NOT claimed their
 * page: a name, and the credits a team collected from them. Nothing else, ever.
 * No bio, no city, no links, no contact, no availability: none of it exists
 * until the person claims the page and chooses to add it.
 *
 * Same contract as loadPublicPerson: it never throws, and every failure (a
 * flag that is off, a handle nobody has, a removed page, a database blip)
 * collapses to the same null, which the page turns into one 404.
 *
 * A profile whose person asked to be taken off is hidden the moment they ask,
 * before an admin confirms, so somebody who wants out is not online for three
 * more days.
 */

export type PublicUnclaimed = {
  displayName: string;
  slug: string;
  /** The first credited role as a word ("Producer"), or empty. URG-304. */
  roleLabel: string;
  credits: Array<{
    releaseTitle: string;
    releaseYear: number | null;
    roles: string[];
  }>;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const roleWord = (role: string): string =>
  role in RELEASE_CREDIT_ROLE_LABELS ? RELEASE_CREDIT_ROLE_LABELS[role as ReleaseCreditRole] : '';

export async function loadUnclaimedPerson(slug: string): Promise<PublicUnclaimed | null> {
  if (process.env.NEXT_PUBLIC_FEATURE_DIRECTORY !== 'true') return null;
  const handle = slug.trim().toLowerCase();
  if (!handle) return null;

  try {
    const admin = adminClient();
    if (!admin) return null;
    const { data, error } = await admin
      .from('person_profiles')
      .select('id, display_name, slug, status, removal_requested_at, removed_at')
      .eq('slug', handle)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    if (row.status !== 'unclaimed' || row.removal_requested_at || row.removed_at) return null;

    const credits = await loadPersonCredits(admin, String(row.id), { onlyVisible: true });
    const shaped = credits.map((credit) => ({
      releaseTitle: credit.releaseTitle,
      releaseYear: credit.releaseYear,
      roles: credit.roles.map(roleWord).filter(Boolean),
    }));
    return {
      displayName: String(row.display_name || ''),
      slug: handle,
      roleLabel: shaped.find((credit) => credit.roles.length > 0)?.roles[0] ?? '',
      credits: shaped,
    };
  } catch {
    return null;
  }
}
