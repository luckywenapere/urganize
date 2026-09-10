// Founder notifications for billing moments. Server only.
//
// Every alert does two things: writes the billing_events row (the durable
// ledger and the admin feed) and, when a recipient is configured, sends the
// founder an email. The row always lands even if mail is off or fails, so
// /admin/teams is never missing history — the email is the interrupt, the row
// is the record.
//
// WHY EMAIL AND NOT THE NOTIFICATIONS TABLE: `notifications` cannot carry
// these. Its `task_id` is NOT NULL with an FK to tasks, and every value in the
// notification_type enum is task-scoped, so a paywall event has no legal row
// there. Extending that enum and nulling its FK would mean a migration to the
// app's hottest realtime table for an internal alert. Email plus the ledger is
// the smaller, safer answer.
//
// NOTHING HERE THROWS. These fire from inside a payment webhook, a cron sweep
// and page-mount telemetry; an alert failing must never fail the thing that
// caused it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmailConfigured, sendEmail } from './email';
import {
  buildFounderBillingAlertEmail,
  type FounderAlertContext,
  type FounderAlertKind,
} from './billing-alert-templates';
import { logBillingEvent, hasBillingEvent } from './billing-events-server';
import { isHardPaywallEnabled, TEAM_TRIAL_PILL_THRESHOLD_DAYS } from './team-billing';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where founder alerts go. Server-only and deliberately NOT in turbo.json
 * (the CRON_SECRET / RESEND_API_KEY precedent — it never reaches a bundle).
 * Unset means alerts are silent: rows still land, no mail is sent. */
const alertRecipient = (): string | null => {
  const value = process.env.BILLING_ALERTS_EMAIL?.trim();
  return value || null;
};

/**
 * Everything the founder needs to act on an alert without opening the app:
 * who the team is, how to reach them, and how invested they are. The last part
 * is the point — a team with 40 tasks in its trial is a different conversation
 * from one with two.
 *
 * Counts are best-effort. A failed count reads as null and renders "unknown"
 * rather than a misleading zero.
 */
export async function buildTeamAlertContext(
  admin: SupabaseClient,
  workspaceId: string,
  extra: Partial<FounderAlertContext> = {}
): Promise<FounderAlertContext> {
  const base: FounderAlertContext = {
    teamName: null,
    ownerName: null,
    ownerEmail: null,
    daysSinceSignup: null,
    releasesDuringTrial: null,
    tasksDuringTrial: null,
    ...extra,
  };

  try {
    const workspaceResult = await admin
      .from('workspaces')
      .select('id, owner_id, name, trial_started_at, trial_ends_at')
      .eq('id', workspaceId)
      .maybeSingle();

    const workspace = workspaceResult.data as {
      id: string;
      owner_id: string | null;
      name: string | null;
      trial_started_at: string | null;
      trial_ends_at: string | null;
    } | null;

    if (!workspace) return base;

    base.teamName = workspace.name;
    base.trialEndsAt = base.trialEndsAt ?? workspace.trial_ends_at;

    if (workspace.owner_id) {
      const profileResult = await admin
        .from('profiles')
        .select('name, artist_name, email, created_at')
        .eq('id', workspace.owner_id)
        .maybeSingle();

      const profile = profileResult.data as {
        name: string | null;
        artist_name: string | null;
        email: string | null;
        created_at: string | null;
      } | null;

      if (profile) {
        base.ownerName = profile.name || profile.artist_name || null;
        base.ownerEmail = profile.email;
        const createdMs = profile.created_at ? Date.parse(profile.created_at) : Number.NaN;
        if (Number.isFinite(createdMs)) {
          base.daysSinceSignup = Math.max(0, Math.floor((Date.now() - createdMs) / DAY_MS));
        }
      }

      // Investment signal: what they actually built. Counted from the trial
      // start when we have one, otherwise all-time for that owner.
      const since = workspace.trial_started_at;
      let releaseQuery = admin
        .from('releases')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', workspace.owner_id);
      if (since) releaseQuery = releaseQuery.gte('created_at', since);
      const releaseCount = await releaseQuery;
      base.releasesDuringTrial = releaseCount.error ? null : (releaseCount.count ?? 0);

      let taskQuery = admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', workspace.owner_id);
      if (since) taskQuery = taskQuery.gte('created_at', since);
      const taskCount = await taskQuery;
      base.tasksDuringTrial = taskCount.error ? null : (taskCount.count ?? 0);
    }
  } catch {
    // Partial context is still useful; send what we have.
  }

  return base;
}

/**
 * Record a billing moment and tell the founder about it.
 *
 * `alsoEmail` is false for moments that belong in the ledger but do not
 * warrant an interrupt (a trial starting, an admin's own comp action).
 */
export async function notifyFounder(
  admin: SupabaseClient,
  input: {
    kind: FounderAlertKind;
    workspaceId: string;
    ownerUserId: string | null;
    actorUserId: string | null;
    planViewed?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const context = await buildTeamAlertContext(admin, input.workspaceId, {
    planViewed: input.planViewed ?? null,
    note: input.note ?? null,
  });

  await logBillingEvent(admin, {
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    actorUserId: input.actorUserId,
    type: input.kind,
    metadata: {
      ...(input.metadata ?? {}),
      teamName: context.teamName,
      ownerEmail: context.ownerEmail,
      releasesDuringTrial: context.releasesDuringTrial,
      tasksDuringTrial: context.tasksDuringTrial,
      daysSinceSignup: context.daysSinceSignup,
    },
  });

  const recipient = alertRecipient();
  if (!recipient || !isEmailConfigured()) return;

  try {
    const email = buildFounderBillingAlertEmail(input.kind, context);
    await sendEmail({
      to: recipient,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch {
    // The row is already written; a failed alert must not surface anywhere.
  }
}

/**
 * Daily sweep: teams entering the last TEAM_TRIAL_PILL_THRESHOLD_DAYS days of
 * their trial — the same threshold the visible pill uses, so the founder is
 * never warned about a team before the team itself sees a countdown.
 * Previously a separately hardcoded "3 days," sized against the original
 * 14-day trial; with the 2026-09-10 shortening to a 3-day trial, a fixed
 * 3-day horizon would have fired for every team on day one. Deriving it from
 * the shared constant is what keeps that from happening again.
 *
 * Runs from the existing daily cron rather than a new schedule (the Vercel
 * Hobby plan caps crons at once per day, and this is a day-granularity
 * question anyway). Deduped on the event row, so a team is
 * only ever announced once per trial however many times this runs.
 *
 * Skips teams that are comped, and teams whose owner already has access —
 * checked against the resolver's own inputs rather than re-deriving them.
 */
export async function runTrialEndingSweep(
  admin: SupabaseClient
): Promise<{ scanned: number; notified: number }> {
  if (!isHardPaywallEnabled()) return { scanned: 0, notified: 0 };

  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + TEAM_TRIAL_PILL_THRESHOLD_DAYS * DAY_MS);

    const result = await admin
      .from('workspaces')
      .select('id, owner_id, name, trial_ends_at, comped_at')
      .is('comped_at', null)
      .gte('trial_ends_at', now.toISOString())
      .lte('trial_ends_at', horizon.toISOString());

    if (result.error) return { scanned: 0, notified: 0 };

    const rows = (result.data || []) as Array<{
      id: string;
      owner_id: string | null;
      trial_ends_at: string | null;
    }>;

    let notified = 0;
    for (const row of rows) {
      // Already announced for this team.
      if (await hasBillingEvent(admin, row.id, 'trial_ending_soon')) continue;

      // A team that has already paid does not need a nudge. Read the owner's
      // subscription directly rather than the resolver, to keep the sweep off
      // the per-request cache.
      if (row.owner_id) {
        const sub = await admin
          .from('subscriptions')
          .select('status, expires_at')
          .eq('user_id', row.owner_id)
          .maybeSingle();
        const subscription = sub.data as { status: string | null; expires_at: string | null } | null;
        if (subscription?.status === 'active' || subscription?.status === 'trialing') {
          const expiresMs = subscription.expires_at
            ? Date.parse(subscription.expires_at)
            : Number.NaN;
          if (!Number.isFinite(expiresMs) || expiresMs > now.getTime()) continue;
        }
      }

      await notifyFounder(admin, {
        kind: 'trial_ending_soon',
        workspaceId: row.id,
        ownerUserId: row.owner_id,
        actorUserId: null,
        metadata: { trialEndsAt: row.trial_ends_at, source: 'daily_sweep' },
      });
      notified += 1;
    }

    return { scanned: rows.length, notified };
  } catch {
    return { scanned: 0, notified: 0 };
  }
}
