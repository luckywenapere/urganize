import { NextRequest, NextResponse } from 'next/server';
import {
  blockCuratorAccount,
  createAdminClient,
  getAuthenticatedUser,
  requireAuthenticatedAdmin,
} from '@/app/api/_shared/auth';
import { READ_ONLY_REFUSAL_CODE } from '@/lib/team-billing';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { isCreditsEnabled } from '@/lib/credits/config';
import { readBalances } from '@/lib/credits/credits-server';
import { isPaywallRefusal, shouldAdmitCreditsOnly } from '@/lib/credits/urgans-admission';

/**
 * The gate for UrgAns's own routes (the chat, its saved chats, its embedded
 * actions, voice and the usage line).
 *
 * It is `requireAuthenticatedAdmin` with ONE addition. A team that is walled (its
 * trial ended) or read-only (its plan lapsed) is refused by that gate, and the
 * founder's rule (2026-10-02) is that such a team can still use UrgAns, changes
 * included, paying in credits. So when the gate refuses for the paywall and the
 * credit rules call the team credits-only, the request is admitted here, flagged
 * `creditsOnly`, and the chat route mints the pass that lets the assistant's own
 * tool calls through (lib/urgans-pass.ts).
 *
 * WHAT IT DOES NOT CHANGE, and a later edit must not:
 *   - Nobody else is affected. A request the normal gate admits comes back
 *     exactly as it did, with `creditsOnly: null`.
 *   - Only the PAYWALL refusals are looked at (402, and the read-only 403). A bad
 *     token, a curator account and a missing server setting still answer as before.
 *   - It admits to UrgAns's own routes and nowhere else. Since 2026-10-02 a
 *     team with bought or monthly credits never reaches this branch: the team
 *     resolver calls it 'credits_only' and the normal gate opens the whole app
 *     with Solo features (lib/team-billing.ts). What is left for this branch is
 *     a no-plan team with no such credits (at most trial leftovers), which keeps
 *     UrgAns so it can buy more, and stays walled or read-only everywhere else.
 *   - With credits switched off this is the normal gate and nothing more.
 *
 * Whether the team has credits left is NOT decided here: the metered routes check
 * the balance themselves, and the routes that cost nothing should still work for
 * a team with none. `creditsOnly.funded` only says whether to mint a pass.
 */

export type CreditsOnlyAdmission = {
  workspaceId: string;
  ownerUserId: string | null;
  /** The team holds credits, so its assistant may act. An unreadable balance counts as funded, like every counter here. */
  funded: boolean;
};

type AdminAuth = Extract<Awaited<ReturnType<typeof requireAuthenticatedAdmin>>, { user: unknown }>;

type Admitted = AdminAuth & {
  /** Set only when the team was admitted as credits-only; null for everyone the normal gate lets in. */
  creditsOnly: CreditsOnlyAdmission | null;
};

async function readRefusal(response: NextResponse): Promise<{ status: number; code?: unknown }> {
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return { status: response.status, code: body?.code };
  } catch {
    return { status: response.status };
  }
}

export async function requireUrgansAccess(request: NextRequest): Promise<{ error: NextResponse } | Admitted> {
  const normal = await requireAuthenticatedAdmin(request);
  if (!('error' in normal && normal.error)) {
    return { ...(normal as AdminAuth), creditsOnly: null };
  }
  const refused = { error: normal.error as NextResponse };
  if (!isCreditsEnabled()) return refused;

  // Only the paywall's own refusals are ever looked at. Anything else (a bad
  // token, a curator account, a missing server setting) is returned untouched
  // without a single extra read.
  const refusal = await readRefusal(refused.error);
  if (!isPaywallRefusal(refusal, READ_ONLY_REFUSAL_CODE)) return refused;

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth && auth.error) return refused;
  // A curator-only account has no team; keep the containment explicit.
  if (await blockCuratorAccount(auth.user.id, auth.supabaseUrl)) return refused;

  const team = await getTeamAccessForUser(auth.user.id, auth.user.email);
  if (
    !shouldAdmitCreditsOnly({
      creditsEnabled: true,
      refusal,
      readOnlyCode: READ_ONLY_REFUSAL_CODE,
      team,
    })
  ) {
    return refused;
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient || !team.primaryWorkspaceId) return refused;

  const balances = await readBalances(adminClient, team.primaryWorkspaceId);
  return {
    user: auth.user,
    supabaseUrl: auth.supabaseUrl,
    adminClient,
    creditsOnly: {
      workspaceId: team.primaryWorkspaceId,
      ownerUserId: team.ownerUserId,
      funded: !balances || balances.total > 0,
    },
  };
}
