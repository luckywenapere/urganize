// Self-serve checkout (2026-10-22): the facts behind "Your first 14 days" on
// Home and behind the day 1/3/7 nudges. One read, two users, so the card and
// the email can never disagree about what is done.
//
// Keyed on the team OWNER. Every read fails toward "not done": a step that
// reads as undone costs one reminder, a step that wrongly reads as done would
// hide the help someone needed. The card itself is decided in lib/self-serve.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { readTestRelease } from '@/lib/test-release';
import { isCheckoutPlan, type ChecklistFacts, type CheckoutPlan } from '@/lib/self-serve';

type Admin = SupabaseClient;

export type ChecklistTeam = {
  workspaceId: string;
  ownerUserId: string;
  createdAt: string | null;
  acquisitionPath: string | null;
  /** Hide the card after this time (a close, or a day after it was all done). */
  hiddenAfter: string | null;
  plan: CheckoutPlan;
  facts: ChecklistFacts;
  /** The rollout the deep links open: the newest real one. */
  focusReleaseId: string | null;
  /** How many tasks the focus rollout's plan has, for the day 3 email. */
  focusTaskCount: number;
  focusReleaseTitle: string | null;
};

export function isDistributionOn(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_TRM_SEND !== 'false';
}

export async function loadChecklistTeam(admin: Admin, ownerUserId: string): Promise<ChecklistTeam | null> {
  const workspace = await admin
    .from('workspaces')
    .select('id,created_at,acquisition_path,setup_checklist_dismissed_at')
    .eq('owner_id', ownerUserId)
    .maybeSingle();
  if (workspace.error || !workspace.data) return null;
  const team = workspace.data as {
    id: string;
    created_at: string | null;
    acquisition_path: string | null;
    setup_checklist_dismissed_at: string | null;
  };

  const [subscription, releases, members, handoffs] = await Promise.all([
    admin.from('subscriptions').select('plan').eq('user_id', ownerUserId).maybeSingle(),
    admin
      .from('releases')
      .select('id,title,release_date,artwork_asset_id,metadata,created_at')
      .eq('owner_user_id', ownerUserId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('workspace_members').select('user_id,status').eq('workspace_id', team.id).neq('status', 'removed'),
    admin.from('billing_events').select('id').eq('workspace_id', team.id).eq('type', 'distribution_handoff').limit(1),
  ]);

  const planValue = (subscription.data as { plan: string | null } | null)?.plan ?? null;
  const plan: CheckoutPlan = isCheckoutPlan(planValue) ? planValue : 'manager';

  const realReleases = ((releases.data ?? []) as Array<{
    id: string;
    title: string | null;
    release_date: string | null;
    artwork_asset_id: string | null;
    metadata: Record<string, unknown> | null;
  }>).filter((release) => !readTestRelease(release.metadata ?? {}));
  const releaseIds = realReleases.map((release) => release.id);
  const focus = realReleases[0] ?? null;

  let doneTasks = 0;
  let focusTaskCount = 0;
  let distributionStarted = ((handoffs.data ?? []) as unknown[]).length > 0;
  if (releaseIds.length > 0) {
    const [done, focusTasks, submissions] = await Promise.all([
      admin.from('tasks').select('id', { count: 'exact', head: true }).in('release_id', releaseIds).eq('status', 'done'),
      focus
        ? admin.from('tasks').select('id', { count: 'exact', head: true }).eq('release_id', focus.id)
        : Promise.resolve({ count: 0 }),
      admin.from('distribution_submissions').select('id').in('release_id', releaseIds).limit(1),
    ]);
    doneTasks = (done as { count: number | null }).count ?? 0;
    focusTaskCount = (focusTasks as { count: number | null }).count ?? 0;
    if (!submissions.error && (submissions.data ?? []).length > 0) distributionStarted = true;
  }

  const invitedSomeone = ((members.data ?? []) as Array<{ user_id: string | null }>).some(
    (member) => member.user_id !== ownerUserId
  );

  return {
    workspaceId: team.id,
    ownerUserId,
    createdAt: team.created_at,
    acquisitionPath: team.acquisition_path,
    hiddenAfter: team.setup_checklist_dismissed_at,
    plan,
    facts: {
      plan,
      rolloutCount: realReleases.length,
      doneTasks,
      hasCoverAndDetails: realReleases.some((release) => Boolean(release.artwork_asset_id) && Boolean(release.release_date)),
      invitedSomeone,
      distributionStarted,
      distributionOn: isDistributionOn(),
    },
    focusReleaseId: focus?.id ?? null,
    focusTaskCount,
    focusReleaseTitle: focus?.title ?? null,
  };
}

/** Hide the card from `at` on. Never moves an earlier hide later. */
export async function hideChecklistAfter(admin: Admin, workspaceId: string, at: Date): Promise<void> {
  await admin
    .from('workspaces')
    .update({ setup_checklist_dismissed_at: at.toISOString() })
    .eq('id', workspaceId)
    .is('setup_checklist_dismissed_at', null);
}
