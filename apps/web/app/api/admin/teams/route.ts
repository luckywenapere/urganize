import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyAdmin } from '../_shared';
import { isHardPaywallEnabled, computeExtendedTrialEnd } from '@/lib/team-billing';
import { resolveAdminTeamAccess } from '@/lib/admin-team-access';
import { invalidateTeamAccess } from '@/lib/team-billing-server';
import { invalidateSubscriptionSnapshot } from '@/lib/subscription-access';
import { ACTION_EVENT_TYPE, parseTeamAdminAction } from '@/lib/admin-teams';
import { logBillingEvent } from '@/lib/billing-events-server';
import { notifyFounder } from '@/lib/billing-alerts-server';
import { loadBriefCompletionByWorkspace } from '@/lib/team-brief-server';

// /api/admin/teams — the founder's billing console, and the review surface for
// the migration that started every existing team's trial.
//
// GET lists every team with its resolved state and wall date. That list IS the
// migration summary the spec asks for: one row per team, what it is on, and
// when it lapses.
//
// PATCH runs the six actions. Gated by ADMIN_EMAILS through verifyAdmin, like
// every other admin route, and deliberately NOT by the paywall — a walled
// founder must still be able to comp a team.
//
// Not flag-gated on purpose: with the flag off the columns simply read as
// nulls, and the founder should be able to prepare deals (assign Founding
// Member, comp a partner) BEFORE flipping it on. That is the sequence the
// activation checklist asks for.

const TEAM_LIMIT = 300;

type WorkspaceRow = {
  id: string;
  owner_id: string | null;
  name: string | null;
  created_at: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  comped_at: string | null;
  comped_by: string | null;
  billing_plan: string | null;
  billing_locked_amount: number | null;
  billing_notes: string | null;
};

const WORKSPACE_COLUMNS =
  'id, owner_id, name, created_at, trial_started_at, trial_ends_at, comped_at, comped_by, billing_plan, billing_locked_amount, billing_notes';

/** The wall date a team is actually working toward: none when comped or already
 * read-only (read-only is permanent, so there is no later wall to count down
 * to), the paid period's end when they pay, otherwise the trial end. */
function resolveWallDate(input: {
  compedAt: string | null;
  subscriptionExpiresAt: string | null;
  subscriptionActive: boolean;
  trialEndsAt: string | null;
  readOnly: boolean;
}): string | null {
  if (input.compedAt) return null;
  if (input.readOnly) return null;
  if (input.subscriptionActive) return input.subscriptionExpiresAt;
  return input.trialEndsAt;
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;

  const workspaceResult = await client
    .from('workspaces')
    .select(WORKSPACE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(TEAM_LIMIT);

  if (workspaceResult.error) {
    return NextResponse.json(
      { error: `Could not read teams: ${workspaceResult.error.message}` },
      { status: 500 }
    );
  }

  const workspaces = (workspaceResult.data || []) as WorkspaceRow[];
  const ownerIds = Array.from(
    new Set(workspaces.map((row) => row.owner_id).filter((id): id is string => Boolean(id)))
  );

  const [profilesResult, subscriptionsResult] = await Promise.all([
    ownerIds.length
      ? client
          .from('profiles')
          .select('id, name, artist_name, email, is_subscribed, paid_at')
          .in('id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? client
          .from('subscriptions')
          .select('user_id, plan, status, amount, expires_at, pending_plan, pending_change_requested_at')
          .in('user_id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const profiles = new Map(
    ((profilesResult.data || []) as Array<{
      id: string;
      name: string | null;
      artist_name: string | null;
      email: string | null;
      is_subscribed: boolean | null;
      paid_at: string | null;
    }>).map((row) => [row.id, row])
  );

  const subscriptions = new Map(
    ((subscriptionsResult.data || []) as Array<{
      user_id: string;
      plan: string | null;
      status: string | null;
      amount: number | null;
      expires_at: string | null;
      pending_plan: string | null;
      pending_change_requested_at: string | null;
    }>).map((row) => [row.user_id, row])
  );

  const now = new Date();

  // Brief completion per team (Phase 5). ONE query for every workspace on the
  // page rather than one per row, and it degrades to 0% for everybody rather
  // than failing the console.
  const briefByWorkspace = await loadBriefCompletionByWorkspace(
    client,
    workspaces.map((row) => row.id)
  );

  const teams = workspaces.map((row) => {
    const profile = row.owner_id ? profiles.get(row.owner_id) : undefined;
    const subscription = row.owner_id ? subscriptions.get(row.owner_id) : undefined;

    // Shared with the admin email composer's billing groups (lib/admin-team-access.ts),
    // so this console and "email the teams on a trial" cannot disagree about who
    // is on a trial. It folds in the is_subscribed back-compat branch (a
    // grandfathered team must not look walled here and fine in the app) and the
    // same lapsedFromPayment input the app's own resolver computes.
    const { resolution, subscriptionActive, ownerAllowlisted } = resolveAdminTeamAccess({
      workspace: row,
      profile,
      subscription,
      now,
    });

    return {
      workspaceId: row.id,
      teamName: row.name,
      createdAt: row.created_at,
      ownerUserId: row.owner_id,
      ownerName: profile?.name || profile?.artist_name || null,
      ownerEmail: profile?.email || null,
      state: resolution.state,
      reason: resolution.reason,
      trialStartedAt: row.trial_started_at,
      trialEndsAt: row.trial_ends_at,
      trialDaysLeft: resolution.trialDaysLeft,
      wallDate: resolveWallDate({
        compedAt: row.comped_at,
        subscriptionExpiresAt: subscription?.expires_at ?? null,
        subscriptionActive,
        trialEndsAt: row.trial_ends_at,
        readOnly: resolution.state === 'read_only',
      }),
      comped: Boolean(row.comped_at),
      compedAt: row.comped_at,
      billingPlan: row.billing_plan,
      billingLockedAmount: row.billing_locked_amount,
      billingNotes: row.billing_notes,
      subscriptionPlan: subscription?.plan ?? null,
      subscriptionStatus: subscription?.status ?? null,
      subscriptionExpiresAt: subscription?.expires_at ?? null,
      // A PAYSTACK SWAP THIS TEAM IS OWED. Paystack has no plan-change
      // endpoint, so a change means disabling the old subscription and creating
      // a replacement by hand — and it has to happen before expires_at or the
      // next charge is at the wrong price. The founder is emailed when a change
      // is requested; this is the list, because an email is one chance to
      // notice and a wrong charge is not recoverable by noticing later.
      pendingPlan: subscription?.pending_plan ?? null,
      pendingChangeRequestedAt: subscription?.pending_change_requested_at ?? null,
      allowlisted: ownerAllowlisted,
      grandfathered: !subscriptionActive && profile?.is_subscribed === true,
      briefFilled: briefByWorkspace.get(row.id)?.filled ?? 0,
      briefTotal: briefByWorkspace.get(row.id)?.total ?? 0,
      briefPercent: briefByWorkspace.get(row.id)?.percent ?? 0,
    };
  });

  const counts = teams.reduce<Record<string, number>>((acc, team) => {
    acc[team.state] = (acc[team.state] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    hardPaywallEnabled: isHardPaywallEnabled(),
    stats: { total: teams.length, counts },
    teams,
  });
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin.ok) return admin.response;

  const client = admin.supabaseAdmin as SupabaseClient;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = parseTeamAdminAction(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const action = parsed.action;

  const workspaceResult = await client
    .from('workspaces')
    .select('id, owner_id, name, trial_ends_at')
    .eq('id', action.workspaceId)
    .maybeSingle();

  const workspace = workspaceResult.data as {
    id: string;
    owner_id: string | null;
    name: string | null;
    trial_ends_at: string | null;
  } | null;

  if (!workspace) {
    return NextResponse.json({ error: 'That team could not be found.' }, { status: 404 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const patch: Record<string, unknown> = { updated_at: nowIso };
  const eventMetadata: Record<string, unknown> = {};

  switch (action.type) {
    case 'extend_trial': {
      const nextEnd = computeExtendedTrialEnd(workspace.trial_ends_at, action.days, now);
      patch.trial_ends_at = nextEnd.toISOString();
      // A team that never had a start (pre-migration edge) gets one now, so
      // the alert context can still count what they built "during the trial".
      patch.trial_started_at = workspace.trial_ends_at ? undefined : nowIso;
      eventMetadata.days = action.days;
      eventMetadata.trialEndsAt = nextEnd.toISOString();
      break;
    }
    case 'comp': {
      patch.comped_at = nowIso;
      patch.comped_by = admin.userId;
      break;
    }
    case 'uncomp': {
      patch.comped_at = null;
      patch.comped_by = null;
      break;
    }
    case 'assign_founding': {
      patch.billing_plan = 'founding';
      patch.billing_locked_amount = action.amountMinorUnit;
      eventMetadata.amountMinorUnit = action.amountMinorUnit;
      break;
    }
    case 'set_custom_price': {
      patch.billing_plan = 'custom';
      patch.billing_locked_amount = action.amountMinorUnit;
      eventMetadata.amountMinorUnit = action.amountMinorUnit;
      break;
    }
    case 'mark_paid': {
      if (!workspace.owner_id) {
        return NextResponse.json(
          { error: 'That team has no owner to credit.' },
          { status: 400 }
        );
      }
      // Deal settled outside checkout (invoice, bank transfer, an agreement in
      // legal review). Writes the owner's subscription with an admin-set
      // expires_at, plus a payments row so the money has a paper trail.
      //
      // NEVER writes profiles.is_subscribed: that flag grants paid access
      // FOREVER through the snapshot's back-compat branch, with no expiry, so
      // using it here would make a one-year deal permanent.
      //
      // It DOES write profiles.paid_at (below), and the distinction matters.
      // paid_at grants nothing on its own — inside resolveSnapshot it only ever
      // chooses between 'expired' and 'unpaid', both of which are no-access.
      // What it does do is record that real money landed, which is the sole
      // discriminator behind read-only mode (lapsedFromPayment). Without it, an
      // invoice-settled team — a Label or Group deal, exactly the customer
      // most likely to be on an invoice — would hit the full wall when their
      // year lapsed instead of keeping their catalogue readable.
      const subscriptionUpsert = await client.from('subscriptions').upsert(
        {
          user_id: workspace.owner_id,
          plan: action.plan,
          status: 'active',
          amount: action.amountMinorUnit,
          expires_at: action.expiresAt,
          started_at: nowIso,
          updated_at: nowIso,
          // Only when the admin said. Left out, an existing value stays, which is
          // the old behaviour for the legacy plans whose name is the interval.
          ...(action.billingInterval ? { billing_interval: action.billingInterval } : {}),
        },
        { onConflict: 'user_id' }
      );
      if (subscriptionUpsert.error) {
        return NextResponse.json(
          { error: `Could not record the plan: ${subscriptionUpsert.error.message}` },
          { status: 500 }
        );
      }

      await client.from('payments').insert({
        user_id: workspace.owner_id,
        amount: action.amountMinorUnit,
        reference: `admin_${Date.now()}_${workspace.id.slice(0, 8)}`,
        status: 'success',
        plan: action.plan,
        paystack_response: {
          source: 'admin_mark_paid',
          note: action.note,
          admin_user_id: admin.userId,
          workspace_id: workspace.id,
          expires_at: action.expiresAt,
        },
      });

      // Coalesced, so a second deal never rewrites when this team FIRST paid.
      // Best-effort: the plan is already recorded and the money already has its
      // paper trail, so a failure here must not fail the action.
      const paidAtResult = await client
        .from('profiles')
        .update({ paid_at: nowIso })
        .eq('id', workspace.owner_id)
        .is('paid_at', null);
      if (paidAtResult.error) {
        console.error('[admin-teams] could not stamp paid_at:', paidAtResult.error.message);
      }

      invalidateSubscriptionSnapshot(workspace.owner_id);
      eventMetadata.plan = action.plan;
      eventMetadata.amountMinorUnit = action.amountMinorUnit;
      eventMetadata.expiresAt = action.expiresAt;
      if (action.billingInterval) eventMetadata.billingInterval = action.billingInterval;
      break;
    }
  }

  if ('note' in action && action.note) {
    patch.billing_notes = action.note;
    eventMetadata.note = action.note;
  }

  // Strip the undefined the extend branch may have set, so it does not clear a
  // real trial_started_at.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }

  if (Object.keys(patch).length > 1) {
    const updateResult = await client.from('workspaces').update(patch).eq('id', workspace.id);
    if (updateResult.error) {
      return NextResponse.json(
        { error: `Could not update the team: ${updateResult.error.message}` },
        { status: 500 }
      );
    }
  }

  // Any of these can change who has access, and members other than the owner
  // hold their own cache entries we cannot enumerate cheaply. Clearing the
  // owner covers the common case; the rest converge within the 30s TTL.
  if (workspace.owner_id) invalidateTeamAccess(workspace.owner_id);

  const eventType = ACTION_EVENT_TYPE[action.type];

  // A payment is worth an alert (it is the outcome the founder is chasing);
  // the rest are the founder's own actions and only need the ledger.
  if (eventType === 'manually_marked_paid') {
    await notifyFounder(client, {
      kind: 'manually_marked_paid',
      workspaceId: workspace.id,
      ownerUserId: workspace.owner_id,
      actorUserId: admin.userId,
      note: 'note' in action ? action.note : null,
      metadata: eventMetadata,
    });
  } else {
    await logBillingEvent(client, {
      workspaceId: workspace.id,
      ownerUserId: workspace.owner_id,
      actorUserId: admin.userId,
      type: eventType,
      metadata: eventMetadata,
    });
  }

  return NextResponse.json({ ok: true, workspaceId: workspace.id, action: action.type });
}
