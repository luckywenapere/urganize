import type { SupabaseClient } from '@supabase/supabase-js';
import { decideActivation, type ActivationTrigger } from './activation';
import { readTestRelease } from './test-release';
import {
  captureServerAnalyticsEvent,
  createServerPostHogClient,
  shutdownServerAnalytics,
} from './analytics/server';
import { createPostHogEvent } from './analytics/shared';

// Capturing the `activated` server event (2026-10-01). The rule lives in
// lib/activation.ts; this file only reads the two counts it needs and captures.
//
// LEAF-ONLY on purpose, like lib/seats-server.ts: app/api/invites/[token]
// calls it and that route stays off the paywalled auth chain.
//
// IT NEVER THROWS and never delays the response beyond one small read. Missing
// an activation event costs a data point; failing a release or an invite
// because of it would cost a customer.

const RELEASES_TABLE = 'releases';
const WORKSPACES_TABLE = 'workspaces';
const WORKSPACE_MEMBERS_TABLE = 'workspace_members';

/** More real rollouts than this cannot change the answer: once an account has
 * two, nothing it creates next can be its first. */
const RELEASE_SCAN = 25;

async function countRealReleases(client: SupabaseClient, ownerUserId: string): Promise<number | null> {
  const { data, error } = await client
    .from(RELEASES_TABLE)
    .select('metadata')
    .eq('owner_user_id', ownerUserId)
    .limit(RELEASE_SCAN);
  if (error || !Array.isArray(data)) return null;
  return data.filter(
    (row) => !readTestRelease((row as { metadata?: Record<string, unknown> | null }).metadata)
  ).length;
}

/** Teammates invited or joined in the account's own workspace, owner excluded.
 * Both `invited` and `active` count; `removed` does not. */
async function countInvites(client: SupabaseClient, ownerUserId: string): Promise<number | null> {
  const workspace = await client
    .from(WORKSPACES_TABLE)
    .select('id')
    .eq('owner_id', ownerUserId)
    .maybeSingle();
  const workspaceId = (workspace.data as { id?: string } | null)?.id;
  if (workspace.error || !workspaceId) return null;

  const { count, error } = await client
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .neq('role', 'owner')
    .neq('status', 'removed');
  if (error || count === null) return null;
  return count;
}

async function readWorkspaceOwner(
  client: SupabaseClient,
  workspaceId: string | undefined
): Promise<string | null> {
  if (!workspaceId) return null;
  const { data, error } = await client
    .from(WORKSPACES_TABLE)
    .select('owner_id')
    .eq('id', workspaceId)
    .maybeSingle();
  return error ? null : ((data as { owner_id?: string } | null)?.owner_id ?? null);
}

async function readSignupMs(client: SupabaseClient, ownerUserId: string): Promise<number | null> {
  const result = await client.auth.admin.getUserById(ownerUserId);
  const createdAt = result.data?.user?.created_at;
  const ms = createdAt ? new Date(createdAt).getTime() : Number.NaN;
  return result.error || !Number.isFinite(ms) ? null : ms;
}

/**
 * Call right AFTER a real rollout is created, an email invite is recorded, or
 * someone joins through a link. `ownerUserId` is the account whose activation
 * this is: the rollout's owner, or the workspace owner for an invite.
 *
 * Skip it for a test rollout: it cannot complete anything.
 */
export async function captureActivationIfReached(
  client: SupabaseClient,
  input: {
    /** The account whose activation this is. Omit it and pass `workspaceId`
     * when the actor may not be the owner (an admin inviting into a team, or
     * somebody joining through a link). */
    ownerUserId?: string;
    workspaceId?: string;
    trigger: ActivationTrigger;
    /** Pass it when the caller already has the user, to save a read. */
    signupAt?: string | null;
  }
): Promise<void> {
  try {
    const ownerUserId = input.ownerUserId ?? (await readWorkspaceOwner(client, input.workspaceId));
    if (!ownerUserId) return;

    const signupMs = input.signupAt
      ? new Date(input.signupAt).getTime()
      : await readSignupMs(client, ownerUserId);
    if (signupMs === null || !Number.isFinite(signupMs)) return;

    // The window check comes first and is free, so a long-standing account
    // never pays for the two reads below.
    const nowMs = Date.now();
    const quick = decideActivation({
      trigger: input.trigger,
      signupMs,
      nowMs,
      releaseCount: 1,
      inviteCount: 1,
    });
    if (!quick.activated) return;

    const [releaseCount, inviteCount] = await Promise.all([
      countRealReleases(client, ownerUserId),
      countInvites(client, ownerUserId),
    ]);
    if (releaseCount === null || inviteCount === null) return;

    const decision = decideActivation({
      trigger: input.trigger,
      signupMs,
      nowMs,
      releaseCount,
      inviteCount,
    });
    if (!decision.activated) return;

    const posthog = createServerPostHogClient();
    try {
      captureServerAnalyticsEvent(
        posthog,
        ownerUserId,
        createPostHogEvent('activated', {
          seconds_since_signup: decision.secondsSinceSignup,
          completed_by: decision.completedBy,
        })
      );
    } finally {
      await shutdownServerAnalytics(posthog);
    }
  } catch (error) {
    console.error('[activation] could not evaluate', error);
  }
}
