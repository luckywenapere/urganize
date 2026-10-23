import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { getSubscriptionSnapshot } from '@/lib/subscription-access';
import { getTeamAccessForUser, invalidateAllTeamAccess } from '@/lib/team-billing-server';
import { readTestRelease } from '@/lib/test-release';
import {
  SHARE_REWARD_DAYS,
  decideShareReward,
  isShareRewardEligible,
  isShareRewardEnabled,
} from '@/lib/share-reward';
import {
  captureServerAnalyticsEvent,
  createPostHogEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from '@/lib/posthog';

// The share reward (founder call, 2026-10-11): one month free, once per team,
// for tapping any share button in the share-to-socials sheet. The rules live in
// lib/share-reward.ts; this route reads the rows, asks it, and writes.
//
// GET  -> { eligible, claimed }  Does this person see the offer? Every failure
//         answers { eligible: false }: the offer can only ever be missing, it
//         can never break the sheet.
// POST -> { claimed: true, kind, accessUntil } the first time, or
//         { claimed: false, reason } after that. Idempotent: the write is
//         conditional on share_reward_claimed_at still being null, so two taps
//         on two phones give one month, not two.
//
// OPEN ROUTE, ON PURPOSE (the /api/nps and /api/presence reasoning):
// getAuthenticatedUser, never the paywall wrapper. A read-only team is exactly
// who the month helps, and the paywall wrapper refuses its POSTs with a 403.
// The team is the person's PRIMARY team as the paywall itself resolves it
// (getTeamAccessForUser), and only its owner or an admin can claim.

export const dynamic = 'force-dynamic';

const RELEASE_SCAN = 50;

type WorkspaceRewardRow = {
  id: string;
  owner_id: string | null;
  trial_ends_at: string | null;
  share_reward_claimed_at: string | null;
  paid_bonus_days: number | null;
};

const notEligible = () => NextResponse.json({ eligible: false, claimed: false });

async function readWorkspace(admin: SupabaseClient, workspaceId: string): Promise<WorkspaceRewardRow | null> {
  const { data, error } = await admin
    .from('workspaces')
    .select('id, owner_id, trial_ends_at, share_reward_claimed_at, paid_bonus_days')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkspaceRewardRow | null) ?? null;
}

/** Does this team have a real rollout, not just test ones? Rollouts are owned
 *  by the person who created them, so every active member counts. */
async function hasRealRollout(admin: SupabaseClient, workspaceId: string, ownerId: string): Promise<boolean> {
  const { data: members, error: membersError } = await admin
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .neq('status', 'removed');
  if (membersError) throw membersError;
  const ids = Array.from(
    new Set(
      [ownerId, ...((members ?? []) as Array<{ user_id: string | null }>).map((row) => row.user_id)].filter(
        (id): id is string => Boolean(id)
      )
    )
  );
  const { data: releases, error } = await admin
    .from('releases')
    .select('metadata')
    .in('owner_user_id', ids)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(RELEASE_SCAN);
  if (error) throw error;
  return ((releases ?? []) as Array<{ metadata?: Record<string, unknown> | null }>).some(
    (row) => !readTestRelease(row.metadata ?? null)
  );
}

export async function GET(request: NextRequest) {
  if (!isShareRewardEnabled()) return notEligible();
  try {
    const auth = await getAuthenticatedUser(request);
    if ('error' in auth) return notEligible();
    const admin = createAdminClient(auth.supabaseUrl);
    if (!admin) return notEligible();

    const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
    if (!team.primaryWorkspaceId || !team.isOwnerOrAdmin) return notEligible();

    const workspace = await readWorkspace(admin, team.primaryWorkspaceId);
    if (!workspace?.owner_id) return notEligible();
    if (workspace.share_reward_claimed_at) return NextResponse.json({ eligible: false, claimed: true });

    const eligible = isShareRewardEligible({
      enabled: true,
      isOwnerOrAdmin: team.isOwnerOrAdmin,
      claimedAt: workspace.share_reward_claimed_at,
      access: { state: team.state, reason: team.reason },
      hasRealRollout: await hasRealRollout(admin, workspace.id, workspace.owner_id),
    });
    return NextResponse.json({ eligible, claimed: false });
  } catch (error) {
    // Includes the migration not being applied yet: the columns do not exist,
    // the read fails, and nobody is offered anything.
    console.warn('[share-reward] eligibility check failed', error);
    return notEligible();
  }
}

export async function POST(request: NextRequest) {
  if (!isShareRewardEnabled()) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;
  const admin = createAdminClient(auth.supabaseUrl);
  if (!admin) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const posthog = createServerPostHogClient();
  try {
    const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
    if (!team.primaryWorkspaceId) {
      return NextResponse.json({ claimed: false, reason: 'no_team' }, { status: 403 });
    }
    if (!team.isOwnerOrAdmin) {
      return NextResponse.json({ claimed: false, reason: 'not_owner' }, { status: 403 });
    }

    const workspace = await readWorkspace(admin, team.primaryWorkspaceId);
    if (!workspace?.owner_id) {
      return NextResponse.json({ claimed: false, reason: 'no_team' }, { status: 403 });
    }
    if (workspace.share_reward_claimed_at) {
      return NextResponse.json({ claimed: false, reason: 'already_claimed' });
    }
    if (!(await hasRealRollout(admin, workspace.id, workspace.owner_id))) {
      return NextResponse.json({ claimed: false, reason: 'no_rollout' }, { status: 403 });
    }

    const owner = await getSubscriptionSnapshot(workspace.owner_id);
    const now = new Date();
    const decision = decideShareReward({
      claimedAt: workspace.share_reward_claimed_at,
      access: { state: team.state, reason: team.reason },
      ownerPaid: owner.accountStatus === 'paid',
      ownerPaidThrough: owner.expiresAt,
      ownerTrialEndsAt: owner.accountStatus === 'trial' ? owner.trialEndsAt : null,
      teamTrialEndsAt: workspace.trial_ends_at,
      paidBonusDays: workspace.paid_bonus_days,
      now,
    });

    if (decision.kind === 'already_claimed') {
      return NextResponse.json({ claimed: false, reason: 'already_claimed' });
    }
    if (decision.kind === 'not_needed') {
      return NextResponse.json({ claimed: false, reason: 'not_needed' });
    }

    const patch: Record<string, unknown> = {
      share_reward_claimed_at: now.toISOString(),
      share_reward_kind: decision.kind,
      ...(decision.kind === 'trial_extended'
        ? { trial_ends_at: decision.trialEndsAt }
        : { paid_bonus_days: decision.paidBonusDays }),
    };

    // Conditional on the claim still being open: the once-per-team guarantee.
    const { data: updated, error: updateError } = await admin
      .from('workspaces')
      .update(patch)
      .eq('id', workspace.id)
      .is('share_reward_claimed_at', null)
      .select('id');
    if (updateError) throw updateError;
    if (!Array.isArray(updated) || updated.length === 0) {
      return NextResponse.json({ claimed: false, reason: 'already_claimed' });
    }

    // The paywall caches positive answers for 30s per user and cannot list a
    // team's members cheaply, so clear it (the admin comp/extend precedent).
    invalidateAllTeamAccess();

    // Best effort: the founder's billing ledger. A failure here never undoes
    // the month the person was just given.
    const { error: eventError } = await admin.from('billing_events').insert({
      workspace_id: workspace.id,
      owner_user_id: workspace.owner_id,
      actor_user_id: auth.user.id,
      type: 'share_reward_claimed',
      metadata: {
        kind: decision.kind,
        days: SHARE_REWARD_DAYS,
        access_until: decision.accessUntil,
        team_state: team.state,
      },
    });
    if (eventError) console.warn('[share-reward] billing event not recorded', eventError.message);

    captureServerAnalyticsEvent(
      posthog,
      auth.user.id,
      createPostHogEvent('share_reward_claimed', { kind: decision.kind, team_state: team.state })
    );

    return NextResponse.json({ claimed: true, kind: decision.kind, accessUntil: decision.accessUntil });
  } catch (error) {
    console.error('[share-reward] could not claim', error);
    return NextResponse.json({ error: 'Could not add your free month right now.' }, { status: 500 });
  } finally {
    await shutdownServerAnalytics(posthog);
  }
}
