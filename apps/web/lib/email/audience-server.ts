import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveAdminTeamAccess } from '../admin-team-access';
import { EMAIL_SUPPRESSIONS_TABLE } from './suppression-server';
import {
  describeAudience,
  finalizeRecipients,
  ownTeamCounts,
  type Audience,
  type Candidate,
  type FinalRecipients,
} from './audience';

// Who a dashboard email goes to, read from the database. The rules (which
// states count as "on a trial", how duplicates and unsubscribes are handled)
// are pure and tested in audience.ts and admin-team-access.ts; this file only
// reads the rows they need.
//
// Everything is read with the service-role client and in pages, because
// PostgREST caps a response at 1,000 rows and a silently truncated audience is
// an email that some people never get.

const PAGE = 1000;
const MAX_ROWS = 50_000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function readAll<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

type ProfileRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  created_at: string | null;
  is_subscribed: boolean | null;
  paid_at: string | null;
};

type WorkspaceRow = {
  id: string;
  owner_id: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  comped_at: string | null;
  billing_plan: string | null;
  billing_locked_amount: number | null;
};

/** A curator-only account is a playlist owner who never switched the team side
 *  on. They are not who a product email to "everyone" is for. */
const isTeamSideAccount = (profile: ProfileRow) => profile.role !== 'curator' && Boolean(profile.email);

const toCandidate = (profile: ProfileRow): Candidate => ({
  email: profile.email || '',
  name: profile.name || '',
  userId: profile.id,
});

async function readProfiles(admin: SupabaseClient): Promise<ProfileRow[]> {
  return readAll<ProfileRow>((from, to) =>
    admin
      .from('profiles')
      .select('id,email,name,role,created_at,is_subscribed,paid_at')
      .order('id', { ascending: true })
      .range(from, to)
  );
}

/** Who owns at least one rollout, and who is a member of someone else's team. */
async function readTeamFacts(admin: SupabaseClient) {
  const [workspaces, memberships, releases] = await Promise.all([
    readAll<WorkspaceRow>((from, to) =>
      admin
        .from('workspaces')
        .select('id,owner_id,trial_started_at,trial_ends_at,comped_at,billing_plan,billing_locked_amount')
        .order('id', { ascending: true })
        .range(from, to)
    ),
    readAll<{ workspace_id: string; user_id: string | null }>((from, to) =>
      admin
        .from('workspace_members')
        .select('workspace_id,user_id')
        .eq('status', 'active')
        .not('user_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    readAll<{ owner_user_id: string }>((from, to) =>
      admin
        .from('releases')
        .select('owner_user_id')
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  const ownerOf = new Map(workspaces.map((row) => [row.id, row.owner_id]));
  const foreignMembers = new Set(
    memberships
      .filter((row) => row.user_id && ownerOf.get(row.workspace_id) !== row.user_id)
      .map((row) => row.user_id as string)
  );
  const rolloutOwners = new Set(releases.map((row) => row.owner_user_id));
  return { workspaces, foreignMembers, rolloutOwners };
}

async function billingGroupCandidates(
  admin: SupabaseClient,
  profiles: ProfileRow[],
  group: 'trial' | 'paying' | 'trial_ended'
): Promise<Candidate[]> {
  const { workspaces, foreignMembers, rolloutOwners } = await readTeamFacts(admin);
  const subscriptions = await readAll<{ user_id: string; status: string | null; expires_at: string | null }>(
    (from, to) =>
      admin.from('subscriptions').select('user_id,status,expires_at').order('user_id', { ascending: true }).range(from, to)
  );
  const subscriptionOf = new Map(subscriptions.map((row) => [row.user_id, row]));
  const profileOf = new Map(profiles.map((row) => [row.id, row]));
  const now = new Date();

  const out: Candidate[] = [];
  for (const workspace of workspaces) {
    const owner = workspace.owner_id ? profileOf.get(workspace.owner_id) : undefined;
    if (!owner || !isTeamSideAccount(owner)) continue;
    if (!ownTeamCounts({ hasForeignMembership: foreignMembers.has(owner.id), ownsRollouts: rolloutOwners.has(owner.id) })) {
      continue;
    }
    const { resolution } = resolveAdminTeamAccess({
      workspace,
      profile: owner,
      subscription: subscriptionOf.get(owner.id),
      now,
    });
    const matches =
      (group === 'trial' && resolution.state === 'trial' && resolution.reason === 'trial_active') ||
      (group === 'paying' && resolution.state === 'paid' && resolution.reason === 'owner_paid') ||
      (group === 'trial_ended' && (resolution.state === 'walled' || resolution.state === 'free'));
    if (matches) out.push(toCandidate(owner));
  }
  return out;
}

async function readSuppressedForAnnouncements(admin: SupabaseClient): Promise<Set<string>> {
  const rows = await readAll<{ email: string }>((from, to) =>
    admin
      .from(EMAIL_SUPPRESSIONS_TABLE)
      .select('email')
      .in('scope', ['all', 'announcements'])
      .order('email', { ascending: true })
      .range(from, to)
  );
  return new Set(rows.map((row) => row.email.trim().toLowerCase()));
}

export type WaitlistLoader = () => Promise<Array<{ email: string; name: string }>>;

export type ResolvedAudience =
  | ({ ok: true; label: string } & FinalRecipients)
  | { ok: false; error: string };

export async function resolveAudience(
  admin: SupabaseClient,
  audience: Audience,
  options: { loadWaitlist?: WaitlistLoader } = {}
): Promise<ResolvedAudience> {
  try {
    const profiles = await readProfiles(admin);
    let candidates: Candidate[] = [];

    if (audience.kind === 'everyone') {
      candidates = profiles.filter(isTeamSideAccount).map(toCandidate);
    } else if (audience.kind === 'person') {
      const match = profiles.find((row) => (row.email || '').trim().toLowerCase() === audience.email);
      candidates = [match ? toCandidate(match) : { email: audience.email, name: '', userId: null }];
    } else if (audience.kind === 'waitlist') {
      if (!options.loadWaitlist) return { ok: false, error: 'The waitlist is not connected on this deployment.' };
      // People who already made an account are "everyone", not the waitlist.
      const accountEmails = new Set(profiles.map((row) => (row.email || '').trim().toLowerCase()));
      candidates = (await options.loadWaitlist())
        .filter((row) => !accountEmails.has(row.email.trim().toLowerCase()))
        .map((row) => ({ email: row.email, name: row.name, userId: null }));
    } else if (audience.group === 'recent') {
      const cutoff = Date.now() - audience.days * 24 * 60 * 60 * 1000;
      candidates = profiles
        .filter(isTeamSideAccount)
        .filter((row) => row.created_at && Date.parse(row.created_at) >= cutoff)
        .map(toCandidate);
    } else if (audience.group === 'no_rollout') {
      const { foreignMembers, rolloutOwners } = await readTeamFacts(admin);
      candidates = profiles
        .filter(isTeamSideAccount)
        .filter((row) => !rolloutOwners.has(row.id) && !foreignMembers.has(row.id))
        .map(toCandidate);
    } else {
      candidates = await billingGroupCandidates(admin, profiles, audience.group);
    }

    const suppressed = await readSuppressedForAnnouncements(admin);
    return { ok: true, label: describeAudience(audience), ...finalizeRecipients(candidates, suppressed) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[email-audience] resolve failed', message);
    return { ok: false, error: `Could not work out who this goes to: ${message}` };
  }
}
