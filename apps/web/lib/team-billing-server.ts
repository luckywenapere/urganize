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
import { isCreditsEnabled } from './credits/config';
import { readBalances } from './credits/credits-server';
import {
  TEAM_TRIAL_EXPIRY_GRACE_MS,
  combineTeamAccess,
  computeTeamTrialDaysLeft,
  lapsedFromPayment,
  resolveTeamAccess,
  couldBeCreditsOnly,
  isFundedForAccess,
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

/**
 * workspaces.paid_bonus_days for these teams, as a map. Never throws, and any
 * failure (including the column not existing yet) is an empty map, which reads
 * as "no bonus": strictly the behaviour before the share reward existed.
 */
export async function readPaidBonusDays(
  client: SupabaseClient,
  workspaceIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (workspaceIds.length === 0) return out;
  try {
    const { data, error } = await client
      .from(WORKSPACES_TABLE)
      .select('id, paid_bonus_days')
      .in('id', workspaceIds);
    if (error || !Array.isArray(data)) return out;
    for (const row of data as Array<{ id: string; paid_bonus_days: number | null }>) {
      const days = Number(row.paid_bonus_days) || 0;
      if (days > 0) out.set(row.id, days);
    }
  } catch {
    // An empty map is the safe answer.
  }
  return out;
}

/**
 * workspaces.trial_cancelled_at for these teams (the cancel flow,
 * 20261014150000_cancel_flow.sql), as a map of the ones that cancelled. Read on
 * its own for the readPaidBonusDays reason: before the migration the column does
 * not exist, and an error here reads as "never cancelled", which is exactly the
 * behaviour before the cancel flow existed (the wall for an ended trial).
 */
export async function readTrialCancelledAt(
  client: SupabaseClient,
  workspaceIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (workspaceIds.length === 0) return out;
  try {
    const { data, error } = await client
      .from(WORKSPACES_TABLE)
      .select('id, trial_cancelled_at')
      .in('id', workspaceIds);
    if (error || !Array.isArray(data)) return out;
    for (const row of data as Array<{ id: string; trial_cancelled_at: string | null }>) {
      if (row.trial_cancelled_at) out.set(row.id, row.trial_cancelled_at);
    }
  } catch {
    // An empty map is the safe answer.
  }
  return out;
}

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

// One resolution per user at a time (URG-314). The gate in
// app/api/_shared/auth.ts starts this read alongside the curator check, and
// requireActiveAccount asks again a moment later; both share one set of reads
// instead of racing two. Settled entries are removed straight away, so this is
// never a cache of its own — the TTL cache above stays the only one.
const accessInFlight = new Map<string, Promise<TeamAccessSnapshot>>();

export function invalidateTeamAccess(userId: string): void {
  if (userId) {
    accessCache.delete(userId);
    accessInFlight.delete(userId);
  }
}

/** Clear everything. Used by admin actions that change a team's state for
 * members we cannot enumerate cheaply (comp, uncomp, extend): the blast radius
 * is one 30s cache on one instance, and correctness beats precision here. */
export function invalidateAllTeamAccess(): void {
  accessCache.clear();
  accessInFlight.clear();
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

  const pending = accessInFlight.get(userId);
  if (pending) return pending;

  const run = resolveTeamAccessForUser(userId, email);
  accessInFlight.set(userId, run);
  try {
    return await run;
  } finally {
    if (accessInFlight.get(userId) === run) accessInFlight.delete(userId);
  }
}

async function resolveTeamAccessForUser(
  userId: string,
  email?: string | null
): Promise<TeamAccessSnapshot> {
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

    // The owner profile read and the owners' subscription snapshots used to
    // run one after the other; they are independent, so they now share one
    // round trip (URG-314). A snapshot is skipped only when the caller's own
    // verified email already allowlists them; an owner allowlisted by the
    // email on their profile costs one extra (30s-cached) snapshot read that
    // is then ignored, which is cheaper than waiting for the profile first.
    const selfAllowlisted = isAllowlistedEmail(email ?? null);
    const [ownerProfilesResult, snapshotEntries] = await Promise.all([
      client.from(PROFILES_TABLE).select('id, name, email, artist_name').in('id', ownerIds),
      Promise.all(
        ownerIds.map(async (ownerId) =>
          [
            ownerId,
            ownerId === userId && selfAllowlisted ? null : await getSubscriptionSnapshot(ownerId),
          ] as const
        )
      ),
    ]);
    const snapshotByOwner = new Map(snapshotEntries);

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
        /** The snapshot's expiresAt, for the share reward's bonus days. */
        paidThrough: string | null;
      }
    >();
    for (const ownerId of ownerIds) {
      const ownerEmail =
        ownerId === userId ? (email ?? ownerProfiles.get(ownerId)?.email ?? null)
                           : (ownerProfiles.get(ownerId)?.email ?? null);
      const snapshot = snapshotByOwner.get(ownerId) ?? null;
      if (isAllowlistedEmail(ownerEmail) || !snapshot) {
        ownerAccess.set(ownerId, {
          hasAccess: true,
          allowlisted: true,
          plan: null,
          paidAt: null,
          paidThrough: null,
        });
        continue;
      }
      ownerAccess.set(ownerId, {
        hasAccess: snapshot.hasAccess,
        allowlisted: false,
        plan: snapshot.plan,
        paidAt: snapshot.paidAt,
        paidThrough: snapshot.expiresAt,
      });
    }

    // The share reward's bonus days (lib/share-reward.ts). Read ONLY when some
    // owner has no access of their own, since that is the only case they can
    // change the answer, and read on their own so a missing column (the
    // migration not yet applied) costs nothing: an error reads as no bonus.
    // Folding the column into WORKSPACE_COLUMNS would instead fail that whole
    // read before the migration, and this resolver fails OPEN on a failed read.
    const bonusDays = new Map<string, number>();
    const needsBonus = workspaces.some(
      (row) => !row.owner_id || !ownerAccess.get(row.owner_id)?.hasAccess
    );
    const trialCancelled = new Map<string, string>();
    if (needsBonus) {
      const ids = workspaces.map((row) => row.id);
      const [bonus, cancelled] = await Promise.all([
        readPaidBonusDays(client, ids),
        readTrialCancelledAt(client, ids),
      ]);
      for (const [id, days] of bonus) bonusDays.set(id, days);
      for (const [id, when] of cancelled) trialCancelled.set(id, when);
    }

    const accessInput = (row: WorkspaceRow, creditsFunded: boolean) => {
      const owner = row.owner_id ? ownerAccess.get(row.owner_id) : undefined;
      return resolveTeamAccess({
        ownerHasAccess: Boolean(owner?.hasAccess),
        ownerAllowlisted: Boolean(owner?.allowlisted),
        ownerLapsedFromPayment: lapsedFromPayment({
          ownerHasAccess: Boolean(owner?.hasAccess),
          ownerPaidAt: owner?.paidAt ?? null,
        }),
        team: {
          ...toBillingFields(row),
          paidBonusDays: bonusDays.get(row.id) ?? 0,
          trialCancelledAt: trialCancelled.get(row.id) ?? null,
        },
        graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
        creditsFunded,
        ownerPaidThrough: owner?.paidThrough ?? null,
      });
    };

    // Credits-only access (2026-10-02). A balance is read only for a team that
    // would otherwise be walled or read-only, so a team on a plan or a trial pays
    // nothing extra. One read per such team, in parallel.
    const fundedWorkspaces = new Set<string>();
    if (isCreditsEnabled()) {
      const candidates = workspaces.filter((row) => couldBeCreditsOnly(accessInput(row, false).state));
      await Promise.all(
        candidates.map(async (row) => {
          if (isFundedForAccess(await readBalances(client, row.id))) fundedWorkspaces.add(row.id);
        })
      );
    }

    const resolveFor = (row: WorkspaceRow) => {
      const owner = row.owner_id ? ownerAccess.get(row.owner_id) : undefined;
      const access = accessInput(row, fundedWorkspaces.has(row.id));
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
  return (await getWorkspaceAccess(workspaceId))?.tier ?? null;
}

/**
 * The same resolution as getWorkspaceTier, keeping the access state as well.
 *
 * Added for Suggested grants (2026-10-11), which is for paying teams only: the
 * tier alone cannot say that, because a trial, a grace period and a walled team
 * all resolve to the flagship tier on purpose. `allowlisted` is our own staff
 * team, which resolves to Label before any subscription is read.
 *
 * Returns null when it cannot tell. Same rule as getWorkspaceTier's callers:
 * null never grants anything paid.
 */
export async function getWorkspaceAccess(
  workspaceId: string
): Promise<{ state: TeamAccessState | 'allowlisted'; tier: PricingTierId } | null> {
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

    if (isAllowlistedEmail(ownerEmail)) return { state: 'allowlisted', tier: 'label' };

    const snapshot = await getSubscriptionSnapshot(row.owner_id);
    const [bonusMap, cancelledMap] = snapshot.hasAccess
      ? [new Map<string, number>(), new Map<string, string>()]
      : await Promise.all([readPaidBonusDays(client, [row.id]), readTrialCancelledAt(client, [row.id])]);
    const paidBonusDays = bonusMap.get(row.id) ?? 0;
    const trialCancelledAt = cancelledMap.get(row.id) ?? null;
    const baseInput = {
      ownerHasAccess: snapshot.hasAccess,
      ownerLapsedFromPayment: lapsedFromPayment({
        ownerHasAccess: snapshot.hasAccess,
        ownerPaidAt: snapshot.paidAt,
      }),
      team: { ...toBillingFields(row), paidBonusDays, trialCancelledAt },
      graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
      ownerPaidThrough: snapshot.expiresAt,
    };
    let access = resolveTeamAccess(baseInput);
    // A credits-only team joins under Solo's seat ceiling, not the fail-open one.
    if (isCreditsEnabled() && couldBeCreditsOnly(access.state)) {
      if (isFundedForAccess(await readBalances(client, row.id))) {
        access = resolveTeamAccess({ ...baseInput, creditsFunded: true });
      }
    }

    const tier = resolveTeamTier({
      state: access.state,
      ownerPlan: snapshot.plan,
      billingPlan: row.billing_plan,
    });
    return { state: access.state, tier };
  } catch (error) {
    console.error('[team-billing] could not resolve workspace tier:', error);
    return null;
  }
}
