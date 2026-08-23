// Team trial + hard paywall — the I/O half. Server only.
//
// Answers one question for the gate, the wall, the pill and the admin panel:
// does THIS user's team still have access, and if not, what should we tell
// them? The pure decisions live in lib/team-billing.ts; this module does the
// reads and the caching.
//
// WHY IT DOES NOT USE resolveWorkspaceAccessContext. That function
// (lib/tasks-server.ts) already resolves memberships, primary workspace,
// release-owner ids and artist scopes — but it also PROVISIONS a workspace on
// miss, reads artists, and is called from inside route handlers. The gate runs
// BEFORE any of that, on every protected request, so it needs the slimmest
// possible read: memberships, their workspaces' billing columns, the owners'
// snapshots. The primary-workspace rule below deliberately mirrors that
// function's own (owner-first, with the joined-team exception) so the two can
// never disagree about which team a person belongs to.
//
// FAILS OPEN, deliberately, and this is a divergence from the per-user gate it
// replaces (getFallbackSnapshot in lib/subscription-access.ts fails CLOSED).
// That gate read two rows; this resolver reads four kinds and joins them, so it
// has strictly more ways to break on infrastructure it does not control. A wall
// is a sales gate, not a security boundary — RLS and the curator containment
// are the security layer, and neither depends on this. Locking every team out
// of the product because one query timed out would be a far worse failure than
// a walled team getting a few more minutes.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSubscriptionSnapshot } from './subscription-access';
import { resolveTeamTier } from './entitlements';
import type { PricingTierId } from '@urganize/pricing';
import { isAllowlistedEmail } from './paywall-allowlist';
import {
  TEAM_TRIAL_EXPIRY_GRACE_MS,
  combineTeamAccess,
  computeTeamTrialDaysLeft,
  lapsedFromPayment,
  resolveTeamAccess,
  resolveWallVariant,
  type TeamAccessReason,
  type TeamAccessState,
  type WorkspaceBillingFields,
} from './team-billing';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WORKSPACES_TABLE = 'workspaces';
const WORKSPACE_MEMBERS_TABLE = 'workspace_members';
const PROFILES_TABLE = 'profiles';
const RELEASES_TABLE = 'releases';

/** Own read client, service-role, mirroring lib/subscription-access.ts's. The
 * gate needs to read another user's (the owner's) rows, which RLS forbids to
 * the anon key by design. */
const createReadClient = (): SupabaseClient | null => {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

export type TeamAccessSnapshot = {
  hasAccess: boolean;
  /** Whether writes are allowed. Differs from hasAccess for exactly one state,
   *  'read_only' — a team that paid and then lapsed. Read it, never re-derive
   *  it from `state`: like hasAccess, this is the COMBINED answer across every
   *  team the person belongs to, while `state` describes only the primary one. */
  canWrite: boolean;
  /** State of the PRIMARY team — what the wall and the pill talk about. */
  state: TeamAccessState;
  reason: TeamAccessReason;
  primaryWorkspaceId: string | null;
  teamName: string | null;
  trialEndsAt: string | null;
  /** Exact days left (no grace), for copy. */
  trialDaysLeft: number;
  inGrace: boolean;
  /** Whether this user may act on billing: owner of the team, or an admin. */
  isOwnerOrAdmin: boolean;
  ownerUserId: string | null;
  ownerName: string | null;
  /** Server-side only. Never serialize this to a client payload: a teammate
   * has no business reading their owner's email out of an API response. */
  ownerEmail: string | null;
  /** Entitlement tier of the PRIMARY team, for limit checks. Everything that is
   * not confidently a paying Manager resolves to `label`, which is uncapped —
   * see resolveTeamTier. */
  tier: PricingTierId;
};

type MembershipRow = {
  workspace_id: string | null;
  role: string | null;
  status: string | null;
  joined_at: string | null;
  invited_at: string | null;
};

type WorkspaceRow = {
  id: string;
  owner_id: string | null;
  name: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  comped_at: string | null;
  billing_plan: string | null;
  billing_locked_amount: number | null;
};

const WORKSPACE_COLUMNS =
  'id, owner_id, name, trial_started_at, trial_ends_at, comped_at, billing_plan, billing_locked_amount';

const toBillingFields = (row: WorkspaceRow): WorkspaceBillingFields => ({
  trialStartedAt: row.trial_started_at,
  trialEndsAt: row.trial_ends_at,
  compedAt: row.comped_at,
  billingPlan: row.billing_plan,
  billingLockedAmount: row.billing_locked_amount,
});

/** The answer when we cannot tell. Access granted, never cached. */
const openSnapshot = (): TeamAccessSnapshot => ({
  hasAccess: true,
  // Writes granted too, for the same reason reads are: if we cannot tell, we do
  // not punish. Fail-open here has to mean fully open, or an infrastructure blip
  // would silently turn every team read-only.
  canWrite: true,
  state: 'trial',
  reason: 'no_trial_stamp',
  primaryWorkspaceId: null,
  teamName: null,
  trialEndsAt: null,
  trialDaysLeft: 0,
  inGrace: false,
  isOwnerOrAdmin: false,
  ownerUserId: null,
  ownerName: null,
  ownerEmail: null,
  // Uncapped, for the same reason access is granted: if we cannot tell, we do
  // not punish. Capping a team on a read failure would be the worst version of
  // this being wrong.
  tier: 'label',
});

// Positive-only cache, mirroring lib/subscription-access.ts's snapshotCache.
//
// Only hasAccess answers are stored, which is what makes unlocking instant: a
// walled team's negative is never cached, so the request right after a payment,
// a comp or an accepted invite resolves fresh. The cost is that DOWN
// transitions (a trial lapsing, an admin uncomping) can be up to TTL stale on a
// warm instance — bounded, and the admin routes invalidate the owner explicitly.
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 1_000;
const accessCache = new Map<string, { snapshot: TeamAccessSnapshot; expiresAt: number }>();

export function invalidateTeamAccess(userId: string): void {
  if (userId) accessCache.delete(userId);
}

/** Clear everything. Used by admin actions that change a team's state for
 * members we cannot enumerate cheaply (comp, uncomp, extend): the blast radius
 * is one 30s cache on one instance, and correctness beats precision here. */
export function invalidateAllTeamAccess(): void {
  accessCache.clear();
}

function readCache(userId: string): TeamAccessSnapshot | null {
  const entry = accessCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    accessCache.delete(userId);
    return null;
  }
  return entry.snapshot;
}

function writeCache(userId: string, snapshot: TeamAccessSnapshot): void {
  if (!snapshot.hasAccess) return;
  if (accessCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = accessCache.keys().next().value;
    if (oldest !== undefined) accessCache.delete(oldest);
  }
  accessCache.set(userId, { snapshot, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Pick the team this person effectively belongs to.
 *
 * Mirrors resolveWorkspaceAccessContext (lib/tasks-server.ts): owned team
 * first, then earliest-joined — EXCEPT that an owned team with no releases,
 * held by someone who also belongs to another team, is the empty shell that
 * provisioning handed them, so their real team is the one they joined.
 */
function pickPrimary(
  ownWorkspace: WorkspaceRow | null,
  foreign: Array<{ workspace: WorkspaceRow; membership: MembershipRow }>,
  ownReleaseCount: number | null
): { workspace: WorkspaceRow; membership: MembershipRow | null } | null {
  const sortedForeign = [...foreign].sort((a, b) => {
    const aTime = Date.parse(a.membership.joined_at || a.membership.invited_at || '') || 0;
    const bTime = Date.parse(b.membership.joined_at || b.membership.invited_at || '') || 0;
    return aTime - bTime;
  });

  if (ownWorkspace) {
    const isEmptyShell =
      sortedForeign.length > 0 && ownReleaseCount !== null && ownReleaseCount === 0;
    if (!isEmptyShell) return { workspace: ownWorkspace, membership: null };
  }

  const first = sortedForeign[0];
  return first ? { workspace: first.workspace, membership: first.membership } : null;
}

/**
 * The team-access answer for one user. Never throws.
 *
 * `email` short-circuits the allowlist before any read, the same courtesy
 * requireActiveAccount already extends.
 */
export async function getTeamAccessForUser(
  userId: string,
  email?: string | null
): Promise<TeamAccessSnapshot> {
  if (!userId) return openSnapshot();

  const cached = readCache(userId);
  if (cached) return cached;

  try {
    const client = createReadClient();
    if (!client) return openSnapshot();

    const membershipResult = await client
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('workspace_id, role, status, joined_at, invited_at')
      .eq('user_id', userId)
      .neq('status', 'removed');

    if (membershipResult.error) return openSnapshot();

    const memberships = (membershipResult.data || []) as MembershipRow[];
    const workspaceIds = Array.from(
      new Set(memberships.map((row) => row.workspace_id).filter((id): id is string => Boolean(id)))
    );

    // No teams yet: the gate runs before route-level provisioning, so a brand
    // new account legitimately has nothing here. Access, and do not cache — the
    // very next request may have a provisioned team with real dates.
    if (workspaceIds.length === 0) return openSnapshot();

    const workspaceResult = await client
      .from(WORKSPACES_TABLE)
      .select(WORKSPACE_COLUMNS)
      .in('id', workspaceIds);

    if (workspaceResult.error) return openSnapshot();

    const workspaces = (workspaceResult.data || []) as WorkspaceRow[];
    if (workspaces.length === 0) return openSnapshot();

    const membershipByWorkspace = new Map(
      memberships
        .filter((row): row is MembershipRow & { workspace_id: string } => Boolean(row.workspace_id))
        .map((row) => [row.workspace_id, row])
    );

    const ownWorkspace = workspaces.find((row) => row.owner_id === userId) ?? null;
    const foreign = workspaces
      .filter((row) => row.owner_id !== userId)
      .map((workspace) => ({
        workspace,
        membership: membershipByWorkspace.get(workspace.id) as MembershipRow,
      }))
      .filter((entry) => Boolean(entry.membership));

    // Owner snapshots. One read per distinct owner, already 30s-cached inside
    // getSubscriptionSnapshot, so the common single-team case is one warm hit.
    const ownerIds = Array.from(
      new Set(workspaces.map((row) => row.owner_id).filter((id): id is string => Boolean(id)))
    );

    const ownerProfilesResult = await client
      .from(PROFILES_TABLE)
      .select('id, name, email, artist_name')
      .in('id', ownerIds);

    const ownerProfiles = new Map(
      ((ownerProfilesResult.data || []) as Array<{
        id: string;
        name: string | null;
        email: string | null;
        artist_name: string | null;
      }>).map((row) => [row.id, row])
    );

    // `plan` is kept as well as hasAccess: it is what resolveTeamTier maps onto
    // an entitlement tier, and this read already happens, so carrying it costs
    // nothing. An allowlisted owner has no plan to read and is uncapped anyway.
    const ownerAccess = new Map<
      string,
      {
        hasAccess: boolean;
        allowlisted: boolean;
        plan: string | null;
        /** profiles.paid_at — the read-only discriminator. Carried for the same
         *  reason `plan` is: this read already happens, so it costs nothing. */
        paidAt: string | null;
      }
    >();
    await Promise.all(
      ownerIds.map(async (ownerId) => {
        const ownerEmail =
          ownerId === userId ? (email ?? ownerProfiles.get(ownerId)?.email ?? null)
                             : (ownerProfiles.get(ownerId)?.email ?? null);
        const allowlisted = isAllowlistedEmail(ownerEmail);
        if (allowlisted) {
          ownerAccess.set(ownerId, {
            hasAccess: true,
            allowlisted: true,
            plan: null,
            paidAt: null,
          });
          return;
        }
        const snapshot = await getSubscriptionSnapshot(ownerId);
        ownerAccess.set(ownerId, {
          hasAccess: snapshot.hasAccess,
          allowlisted: false,
          plan: snapshot.plan,
          paidAt: snapshot.paidAt,
        });
      })
    );

    const resolveFor = (row: WorkspaceRow) => {
      const owner = row.owner_id ? ownerAccess.get(row.owner_id) : undefined;
      const access = resolveTeamAccess({
        ownerHasAccess: Boolean(owner?.hasAccess),
        ownerAllowlisted: Boolean(owner?.allowlisted),
        ownerLapsedFromPayment: lapsedFromPayment({
          ownerHasAccess: Boolean(owner?.hasAccess),
          ownerPaidAt: owner?.paidAt ?? null,
        }),
        team: toBillingFields(row),
        graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
      });
      return {
        ...access,
        tier: resolveTeamTier({
          state: access.state,
          ownerPlan: owner?.plan ?? null,
          billingPlan: row.billing_plan,
        }),
      };
    };

    const ownResolution = ownWorkspace ? resolveFor(ownWorkspace) : null;
    const foreignResolutions = foreign.map((entry) => ({
      ...entry,
      resolution: resolveFor(entry.workspace),
    }));

    let ownReleaseCount: number | null = null;
    let combined = combineTeamAccess({
      own: ownResolution ? { state: ownResolution.state } : null,
      foreign: foreignResolutions.map((entry) => ({ state: entry.resolution.state })),
      ownReleaseCount,
    });

    // Only the ambiguous shell branch pays for this count.
    if (combined.needsOwnReleaseCount) {
      const countResult = await client
        .from(RELEASES_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', userId);
      ownReleaseCount = countResult.error ? null : (countResult.count ?? 0);
      if (ownReleaseCount === null) return openSnapshot();
      combined = combineTeamAccess({
        own: ownResolution ? { state: ownResolution.state } : null,
        foreign: foreignResolutions.map((entry) => ({ state: entry.resolution.state })),
        ownReleaseCount,
      });
    }

    const primary = pickPrimary(
      ownWorkspace,
      foreign.map(({ workspace, membership }) => ({ workspace, membership })),
      ownReleaseCount
    );

    if (!primary) return openSnapshot();

    const primaryResolution = resolveFor(primary.workspace);
    const ownerProfile = primary.workspace.owner_id
      ? ownerProfiles.get(primary.workspace.owner_id)
      : undefined;

    const snapshot: TeamAccessSnapshot = {
      hasAccess: combined.hasAccess,
      canWrite: combined.canWrite,
      state: primaryResolution.state,
      reason: primaryResolution.reason,
      primaryWorkspaceId: primary.workspace.id,
      teamName: primary.workspace.name,
      trialEndsAt: primaryResolution.trialEndsAt,
      trialDaysLeft: computeTeamTrialDaysLeft(primaryResolution.trialEndsAt),
      inGrace: primaryResolution.inGrace,
      isOwnerOrAdmin:
        resolveWallVariant({
          isWorkspaceOwner: primary.workspace.owner_id === userId,
          membershipRole: primary.membership?.role ?? null,
        }) === 'owner',
      ownerUserId: primary.workspace.owner_id,
      ownerName: ownerProfile?.name || ownerProfile?.artist_name || null,
      ownerEmail: ownerProfile?.email || null,
      tier: primaryResolution.tier,
    };

    writeCache(userId, snapshot);
    return snapshot;
  } catch {
    // Infrastructure failure. See the fail-open rationale in the header.
    return openSnapshot();
  }
}

/** The subset that is safe to hand a browser: no owner email. */
export type TeamAccessPayload = Omit<TeamAccessSnapshot, 'ownerEmail'>;

export function toTeamAccessPayload(snapshot: TeamAccessSnapshot): TeamAccessPayload {
  const { ownerEmail: _ownerEmail, ...payload } = snapshot;
  return payload;
}

/**
 * What tier is THIS team on — asked about a workspace, not about a user.
 *
 * `getTeamAccessForUser` answers "what tier is the team this USER belongs to",
 * which is the wrong question at one of the two seat-enforcement points. When
 * someone redeems a shareable invite link, the acting user is the INVITEE: their
 * own primary team is not the team being joined, so resolving from them would
 * read the wrong ceiling entirely (usually their own empty shell's, which is on
 * a trial and therefore uncapped). This resolves from the workspace's OWNER,
 * which is who is paying.
 *
 * Returns null when it cannot tell, and callers MUST treat null as "do not
 * enforce". Refusing a teammate because a subscription read failed would turn a
 * transient blip into a team that cannot grow, which is a far worse failure than
 * briefly allowing one seat too many.
 *
 * Deliberately uncached: it is called on a write path that happens a handful of
 * times per team per month, and `getSubscriptionSnapshot` underneath it is
 * already 30s-cached, so the marginal cost is one workspace row.
 */
export async function getWorkspaceTier(workspaceId: string): Promise<PricingTierId | null> {
  if (!workspaceId) return null;

  try {
    const client = createReadClient();
    if (!client) return null;

    const workspaceResult = await client
      .from(WORKSPACES_TABLE)
      .select(WORKSPACE_COLUMNS)
      .eq('id', workspaceId)
      .maybeSingle();

    if (workspaceResult.error || !workspaceResult.data) return null;
    const row = workspaceResult.data as unknown as WorkspaceRow;
    if (!row.owner_id) return null;

    const ownerResult = await client
      .from(PROFILES_TABLE)
      .select('email')
      .eq('id', row.owner_id)
      .maybeSingle();
    // A missing profile row is not a reason to refuse: fall through with no
    // email, which simply means the allowlist cannot match.
    const ownerEmail = (ownerResult.data as { email: string | null } | null)?.email ?? null;

    if (isAllowlistedEmail(ownerEmail)) return 'label';

    const snapshot = await getSubscriptionSnapshot(row.owner_id);
    const access = resolveTeamAccess({
      ownerHasAccess: snapshot.hasAccess,
      ownerLapsedFromPayment: lapsedFromPayment({
        ownerHasAccess: snapshot.hasAccess,
        ownerPaidAt: snapshot.paidAt,
      }),
      team: toBillingFields(row),
      graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
    });

    return resolveTeamTier({
      state: access.state,
      ownerPlan: snapshot.plan,
      billingPlan: row.billing_plan,
    });
  } catch (error) {
    console.error('[team-billing] could not resolve workspace tier:', error);
    return null;
  }
}
